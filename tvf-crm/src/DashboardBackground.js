import React, { useEffect, useRef } from 'react'

// Camada visual do fundo do Dashboard — faixas onduladas de pontos em lavanda/roxo, fluindo
// devagar pela tela (referência: teste.png do gestor). Só decorativa: fica atrás de tudo
// (pointer-events none) e nunca interfere em clique/scroll dos cards. Ajusta cor/velocidade/
// densidade/formato só mexendo em CONFIG abaixo — nada mais no arquivo precisa mudar.
const CONFIG = {
  bgColor: '#F8F7FC',
  pointColors: ['#A875E8', '#9B6EE0', '#C7A7F2'],
  pointSize: 1.7,
  spacing: 15,            // distância entre pontos da grade-base, em px — menor = mais fino/denso
  maxPoints: 3200,        // teto de pontos: em tela muito grande, aumenta o spacing em vez de estourar isso
  bandAngle: -0.5,        // ângulo das faixas, em radianos (~-28°, diagonal como na referência)
  bandFreq: 0.012,        // quantas faixas cabem por px — maior = faixas mais próximas umas das outras
  bandSharpness: 12,       // quão "fina e definida" cada faixa fica (maior = faixa mais estreita e nítida)
  curlAmplitude: 55,      // o quanto a faixa se curva ao longo do próprio comprimento (dá o ar orgânico)
  curlFreq: 0.006,        // frequência dessa curvatura
  driftSpeed: 0.00022,    // velocidade com que as faixas "escorrem" pela tela — bem lento de propósito
  curlSpeed: 0.00007,     // velocidade da curvatura mudar de forma
  jitter: 2.5,            // pequeno tremor individual do ponto, só pra dar vida (não desloca muito)
  opacityMin: 0.015,       // opacidade da região "vazia" entre faixas — quase invisível
  opacityMax: 0.55,       // opacidade no centro da faixa
  mouseRadius: 150,       // raio de influência do cursor, em px
  mouseInfluence: 24,     // deslocamento máximo causado pelo cursor, em px
  mouseEase: 0.06,        // velocidade com que o efeito do mouse aparece/some (menor = mais suave)
}

export default function DashboardBackground() {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext('2d')

    const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)')
    const cosA = Math.cos(CONFIG.bandAngle), sinA = Math.sin(CONFIG.bandAngle)

    // Estruturas reaproveitadas frame a frame — nada de criar array/objeto novo dentro do loop.
    let pontos = null
    let n = 0
    let largura = 0, altura = 0, dpr = 1
    let mouseX = -9999, mouseY = -9999
    let rafId = null
    let animando = false

    function construirGrade() {
      const rect = container.getBoundingClientRect()
      largura = Math.max(1, Math.round(rect.width))
      altura = Math.max(1, Math.round(rect.height))
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = largura * dpr
      canvas.height = altura * dpr
      canvas.style.width = largura + 'px'
      canvas.style.height = altura + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      let espaco = CONFIG.spacing
      let cols = Math.ceil(largura / espaco) + 1
      let rows = Math.ceil(altura / espaco) + 1
      // Tela muito grande geraria pontos demais — em vez de manter spacing fixo e estourar o
      // teto de performance, aumenta o espaçamento proporcionalmente pra caber no limite.
      if (cols * rows > CONFIG.maxPoints) {
        const fator = Math.sqrt((cols * rows) / CONFIG.maxPoints)
        espaco = CONFIG.spacing * fator
        cols = Math.ceil(largura / espaco) + 1
        rows = Math.ceil(altura / espaco) + 1
      }

      n = cols * rows
      pontos = {
        baseX: new Float32Array(n), baseY: new Float32Array(n), fase: new Float32Array(n),
        cor: new Uint8Array(n), moxX: new Float32Array(n), moxY: new Float32Array(n),
      }
      let i = 0
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          pontos.baseX[i] = c * espaco
          pontos.baseY[i] = r * espaco
          pontos.fase[i] = Math.random() * Math.PI * 2
          pontos.cor[i] = Math.floor(Math.random() * CONFIG.pointColors.length)
          i++
        }
      }
    }

    function desenhar(t) {
      ctx.clearRect(0, 0, largura, altura)
      const { baseX, baseY, fase, cor, moxX, moxY } = pontos
      const drift = t * CONFIG.driftSpeed
      const curlT = t * CONFIG.curlSpeed

      for (let i = 0; i < n; i++) {
        const bx = baseX[i], by = baseY[i]

        // eixo u = "através" das faixas (decide em qual faixa o ponto cai); eixo v = "ao
        // longo" da faixa (usado pra encurvar a faixa e ela não ficar uma reta perfeita)
        const u = bx * cosA + by * sinA
        const v = -bx * sinA + by * cosA
        const curva = Math.sin(v * CONFIG.curlFreq + curlT) * CONFIG.curlAmplitude

        const ondaFaixa = Math.sin((u + curva) * CONFIG.bandFreq + drift)
        // remapeia -1..1 pra 0..1 e afunila o pico — cria faixa estreita e definida em vez de
        // gradiente suave espalhado por tudo (é isso que faz parecer "faixa", não "névoa")
        const intensidade = Math.pow(Math.max(0, (ondaFaixa + 1) / 2), CONFIG.bandSharpness)

        if (intensidade < 0.025) continue // ponto invisível — nem gasta tempo desenhando

        const jit = CONFIG.jitter
        const px = bx + Math.sin(drift * 3 + fase[i]) * jit
        const py = by + Math.cos(drift * 3 + fase[i]) * jit

        // reação ao mouse: empurra o ponto pra longe do cursor dentro do raio, com transição
        // suave de entrada/saída (lerp) — sem isso o efeito "piscaria" ao entrar/sair do raio
        const dx = px - mouseX, dy = py - mouseY
        const dist = Math.hypot(dx, dy)
        let alvoX = 0, alvoY = 0
        if (dist < CONFIG.mouseRadius && dist > 0.001) {
          const forca = (1 - dist / CONFIG.mouseRadius) * CONFIG.mouseInfluence
          alvoX = (dx / dist) * forca
          alvoY = (dy / dist) * forca
        }
        moxX[i] += (alvoX - moxX[i]) * CONFIG.mouseEase
        moxY[i] += (alvoY - moxY[i]) * CONFIG.mouseEase

        ctx.beginPath()
        ctx.fillStyle = CONFIG.pointColors[cor[i]]
        ctx.globalAlpha = CONFIG.opacityMin + (CONFIG.opacityMax - CONFIG.opacityMin) * intensidade
        ctx.arc(px + moxX[i], py + moxY[i], CONFIG.pointSize, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    function loop(t) {
      desenhar(t)
      rafId = requestAnimationFrame(loop)
    }

    function iniciar() {
      if (animando) return
      animando = true
      if (reduzMovimento.matches) {
        desenhar(0) // um frame só, estático — respeita prefers-reduced-motion
      } else {
        rafId = requestAnimationFrame(loop)
      }
    }
    function parar() {
      animando = false
      if (rafId) cancelAnimationFrame(rafId)
      rafId = null
    }

    function aoRedimensionar() { construirGrade(); if (!animando) desenhar(0) }
    function aoMoverMouse(e) {
      const rect = container.getBoundingClientRect()
      mouseX = e.clientX - rect.left
      mouseY = e.clientY - rect.top
    }
    function aoSairMouse() { mouseX = -9999; mouseY = -9999 }
    function aoTrocarVisibilidade() { if (document.hidden) parar(); else iniciar() }

    construirGrade()
    iniciar()

    window.addEventListener('resize', aoRedimensionar)
    window.addEventListener('mousemove', aoMoverMouse)
    window.addEventListener('mouseout', aoSairMouse)
    document.addEventListener('visibilitychange', aoTrocarVisibilidade)
    reduzMovimento.addEventListener?.('change', aoRedimensionar)

    return () => {
      parar()
      window.removeEventListener('resize', aoRedimensionar)
      window.removeEventListener('mousemove', aoMoverMouse)
      window.removeEventListener('mouseout', aoSairMouse)
      document.removeEventListener('visibilitychange', aoTrocarVisibilidade)
      reduzMovimento.removeEventListener?.('change', aoRedimensionar)
    }
  }, [])

  return (
    <div ref={containerRef} className="dashboard-bg-wrap" aria-hidden="true">
      <canvas ref={canvasRef} className="dashboard-bg-canvas" style={{ background: CONFIG.bgColor }} />
    </div>
  )
}
