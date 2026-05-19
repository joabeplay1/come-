// ==========================================================================
// MOTOR CANVAS PREMIUM: PARTICULAS E DOMINÓS NEON 3D EM TEMPO REAL
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('domino-premium-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Configurações de performance automáticas
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const maxDominos = isMobile ? 8 : 18; // Reduz partículas no celular para manter estável
    const connectionDist = 180;           // Distância máxima para ligar as pecinhas

    let dominos = [];

    // Ajusta o tamanho do canvas para resolução cheia (e trata telas Retina/alta densidade)
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Classe que constrói e gerencia cada peça de Dominó flutuante
    class PremiumDomino {
        constructor() {
            this.reset();
            // Inicia em posições aleatórias na tela no primeiro carregamento
            this.y = Math.random() * canvas.height;
        }

        reset() {
            this.x = Math.random() * canvas.width;
            this.y = canvas.height + 80; // Nasce abaixo da tela
            this.width = 34;
            this.height = 68;
            this.speed = 0.4 + Math.random() * 0.7; // Velocidade lenta e suave
            this.angle = Math.random() * Math.PI * 2;
            this.rotSpeed = (Math.random() - 0.5) * 0.005; // Rotação bem devagar
            
            // Efeito 3D simulado pela escala de profundidade
            this.scale = 0.6 + Math.random() * 0.6;
            this.opacity = 0.15 + Math.random() * 0.35;
            
            // Seleção de cores Neon do tema Casino Gamer
            this.neonColor = Math.random() > 0.5 ? '#00d2ff' : '#bd00ff'; // Azul Neon ou Roxo Neon
            this.miniParticles = [];
        }

        update() {
            this.y -= this.speed;
            this.angle += this.rotSpeed;

            // Gera pequenas sub-partículas brilhantes saindo das peças continuamente
            if (Math.random() < (isMobile ? 0.05 : 0.15)) {
                this.miniParticles.push({
                    x: this.x + (Math.random() - 0.5) * 20,
                    y: this.y + (Math.random() - 0.5) * 40,
                    size: 1 + Math.random() * 2,
                    alpha: 1,
                    speedY: -0.3 - Math.random() * 0.5
                });
            }

            // Atualiza o ciclo de vida das mini partículas
            for (let i = this.miniParticles.length - 1; i >= 0; i--) {
                let p = this.miniParticles[i];
                p.y += p.speedY;
                p.alpha -= 0.015;
                if (p.alpha <= 0) this.miniParticles.splice(i, 1);
            }

            // Se a peça passar do topo da tela, reseta e volta para o fundo
            if (this.y < -80) {
                this.reset();
            }
        }

        draw() {
            // Desenha o rastro/partículas pequenas da peça
            ctx.save();
            for (let p of this.miniParticles) {
                ctx.fillStyle = this.neonColor;
                ctx.globalAlpha = p.alpha * 0.4;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();

            // Desenha a estrutura da pedra de dominó com rotação e efeito 3D
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.angle);
            ctx.scale(this.scale, this.scale);
            ctx.globalAlpha = this.opacity;

            // Brilho Neon (Shadow Blurring) - Desativado em mobile antigo para salvar performance
            if (!isMobile) {
                ctx.shadowBlur = 15;
                ctx.shadowColor = this.neonColor;
            }

            // Corpo da peça (Preto Elegante com contorno Neon)
            ctx.fillStyle = '#0a0d14';
            ctx.strokeStyle = this.neonColor;
            ctx.lineWidth = 1.5;
            
            ctx.beginPath();
            ctx.roundRect(-this.width / 2, -this.height / 2, this.width, this.height, 6);
            ctx.fill();
            ctx.stroke();

            // Linha central divisória branca/neon
            ctx.shadowBlur = 0; // Remove sombra para linhas internas limpas
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.beginPath();
            ctx.moveTo(-this.width / 2 + 3, 0);
            ctx.lineTo(this.width / 2 - 3, 0);
            ctx.stroke();

            // Desenha pontinhos simulados (Brancos) para caracterizar o Dominó
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.beginPath();
            ctx.arc(0, -this.height / 4, 2.5, 0, Math.PI * 2); // Ponto superior
            ctx.arc(0, this.height / 4, 2.5, 0, Math.PI * 2);  // Ponto inferior
            ctx.fill();

            ctx.restore();
        }
    }

    // Inicializa o array de objetos de dominós
    for (let i = 0; i < maxDominos; i++) {
        dominos.push(new PremiumDomino());
    }

    // Desenha as teias/linhas de proximidade entre as peças no fundo
    function drawConnections() {
        for (let i = 0; i < dominos.length; i++) {
            for (let j = i + 1; j < dominos.length; j++) {
                const d1 = dominos[i];
                const d2 = dominos[j];

                // Cálculo da distância por Pitágoras
                const dx = d1.x - d2.x;
                const dy = d1.y - d2.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < connectionDist) {
                    // Gradiente de linha misturando as cores das duas peças próximas
                    const alpha = (1 - dist / connectionDist) * 0.12; // Linhas bem suaves
                    ctx.strokeStyle = d1.neonColor;
                    ctx.globalAlpha = alpha;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(d1.x, d1.y);
                    ctx.lineTo(d2.x, d2.y);
                    ctx.stroke();
                }
            }
        }
    }

    // Loop de renderização principal otimizado por hardware (60 FPS estável)
    function applicationAnimationLoop() {
        // Limpa a tela com transparência curta para criar um leve rastro cinematográfico elegante
        ctx.fillStyle = 'rgba(3, 4, 8, 0.2)';
        ctx.globalAlpha = 1;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Desenha as conexões antes, para que fiquem por baixo das pedras
        drawConnections();

        // Atualiza e renderiza cada dominó
        for (let domino of dominos) {
            domino.update();
            domino.draw();
        }

        requestAnimationFrame(applicationAnimationLoop);
    }

    // Inicializa o motor gráfico
    requestAnimationFrame(applicationAnimationLoop);
});
