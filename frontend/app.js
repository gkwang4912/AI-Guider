/**
 * CODE ALCHEMIST - Main Application
 * Voice to Code Transmutation with Real Backend Integration
 */

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    // API 伺服器位址（本機或 ngrok）
    apiBaseUrl: 'http://localhost:5000',
    // ngrok URL (如需遠端使用)
    // apiBaseUrl: 'https://polite-in-redfish.ngrok-free.app',

    // 語音設定
    speechRecognition: {
        language: 'zh-TW',
        continuous: false,
        interimResults: true
    }
};

// ============================================
// STATE MANAGEMENT
// ============================================
const AppState = {
    IDLE: 'idle',
    RECORDING: 'recording',
    PROCESSING: 'processing',
    PLAYING: 'playing'
};

let currentState = AppState.IDLE;
let recordingStartTime = null;
let timerInterval = null;

// 語音識別相關
let speechRecognition = null;
let recognizedText = '';

// 音訊播放相關
let audioPlayer = null;
let audioContext = null;

// ============================================
// DOM ELEMENTS
// ============================================
const elements = {
    matrixCanvas: document.getElementById('matrixCanvas'),
    visualizationCanvas: document.getElementById('visualizationCanvas'),
    statusValue: document.getElementById('statusValue'),
    timerDisplay: document.getElementById('timerDisplay'),
    transcriptArea: document.getElementById('transcriptArea'),
    transcriptContent: document.getElementById('transcriptContent'),
    userInputArea: document.getElementById('userInputArea'),
    userInputContent: document.getElementById('userInputContent'),
    progressContainer: document.getElementById('progressContainer'),
    progressFill: document.getElementById('progressFill'),
    progressTime: document.getElementById('progressTime'),
    recordBtn: document.getElementById('recordBtn'),
    recordIcon: document.getElementById('recordIcon'),
    recordLabel: document.getElementById('recordLabel'),
    resetBtn: document.getElementById('resetBtn'),
    processingVideo: document.getElementById('processingVideo')
};

// ============================================
// MATRIX BACKGROUND ANIMATION
// ============================================
class MatrixBackground {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.columns = [];
        this.fontSize = 14;
        this.chars = '01';
        this.init();
        this.animate();

        window.addEventListener('resize', () => this.init());
    }

    init() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        const columnCount = Math.floor(this.canvas.width / this.fontSize);
        this.columns = [];

        for (let i = 0; i < columnCount; i++) {
            this.columns.push({
                y: Math.random() * this.canvas.height,
                speed: 0.5 + Math.random() * 1.5,
                opacity: 0.1 + Math.random() * 0.3
            });
        }
    }

    animate() {
        this.ctx.fillStyle = 'rgba(8, 8, 8, 0.1)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.font = `${this.fontSize}px 'Roboto Mono'`;

        for (let i = 0; i < this.columns.length; i++) {
            const col = this.columns[i];
            const char = this.chars[Math.floor(Math.random() * this.chars.length)];
            const x = i * this.fontSize;

            const redValue = 40 + Math.floor(col.opacity * 60);
            this.ctx.fillStyle = `rgba(${redValue}, 0, 0, ${col.opacity})`;
            this.ctx.fillText(char, x, col.y);

            col.y += col.speed;

            if (col.y > this.canvas.height) {
                col.y = 0;
                col.speed = 0.5 + Math.random() * 1.5;
                col.opacity = 0.1 + Math.random() * 0.3;
            }
        }

        requestAnimationFrame(() => this.animate());
    }
}

// ============================================
// VISUALIZATION ANIMATIONS
// ============================================
class VisualizationAnimator {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.animationId = null;
        this.state = AppState.IDLE;
        this.init();

        window.addEventListener('resize', () => this.init());
    }

    init() {
        const parent = this.canvas.parentElement;
        this.canvas.width = parent.clientWidth;
        this.canvas.height = parent.clientHeight;
    }

    start(state) {
        this.state = state;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        this.animate();
    }

    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.clear();
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    animate() {
        this.clear();

        switch (this.state) {
            case AppState.RECORDING:
                this.drawRecordingVisual();
                break;
            case AppState.PROCESSING:
                this.drawProcessingVisual();
                break;
            case AppState.PLAYING:
                this.drawPlayingVisual();
                break;
            default:
                this.drawIdleVisual();
        }

        this.animationId = requestAnimationFrame(() => this.animate());
    }

    drawIdleVisual() {
        const GRID_SIZE = 20;

        // --- CONFIGURATION ---
        const SNAKE_MOVE_SPEED = 15;       // Higher = Slower snake movement
        const TEXT_APPEAR_SPEED = 20;      // Higher = Slower text typing
        const TEXT_STAY_DURATION = 100;    // Higher = Text stays longer before reset (e.g. 80 frames)

        const SPEED_THROTTLE = SNAKE_MOVE_SPEED;

        // Initialize Snake State (Grid Based)
        if (!this.snakeState || this.lastCanvasWidth !== this.canvas.width) {
            this.lastCanvasWidth = this.canvas.width;

            const cols = Math.floor(this.canvas.width / GRID_SIZE);
            const rows = Math.floor(this.canvas.height / GRID_SIZE);
            const startCol = Math.floor(cols / 2);
            const startRow = Math.floor(rows / 2);

            this.snakeState = {
                gridSize: GRID_SIZE,
                cols: cols,
                rows: rows,
                segments: [],
                maxLength: 5,
                direction: { c: 1, r: 0 },
                moveTimer: 0,
                food: null,
                mode: 'playing', // playing, crashing, rebirthing
                rebirthStep: 0
            };

            for (let i = 0; i < 5; i++) {
                this.snakeState.segments.push({
                    c: startCol - i,
                    r: startRow,
                    char: Math.random() > 0.5 ? '1' : '0'
                });
            }
            this.spawnFood();
        }

        const state = this.snakeState;

        // --- REBIRTH ANIMATION ---
        if (state.mode === 'rebirthing') {
            state.moveTimer++;
            if (state.moveTimer > TEXT_APPEAR_SPEED) { // Use Configured Speed
                state.moveTimer = 0;
                state.rebirthStep++;

                let targetText = "AI Guider";

                // Logic Fix: If moving Right or Down, we reverse the string so head=End reads correctly
                if (state.direction.c > 0 || state.direction.r > 0) {
                    targetText = targetText.split('').reverse().join('');
                }

                // Transform segments
                if (state.rebirthStep <= targetText.length) {
                    const charIndex = state.rebirthStep - 1;
                    if (state.segments[charIndex]) {
                        state.segments[charIndex].char = targetText[charIndex];
                        state.segments[charIndex].isSpecial = true;
                    }
                }

                // End animation and reset
                if (state.rebirthStep > targetText.length + (TEXT_STAY_DURATION / 10)) { // Scaled delay
                    const startCol = Math.floor(state.cols / 2);
                    const startRow = Math.floor(state.rows / 2);
                    state.segments = [{ c: startCol, r: startRow, char: '1' }];
                    state.maxLength = 5;
                    state.direction = { c: 1, r: 0 };
                    state.mode = 'playing';
                    state.rebirthStep = 0;
                    this.spawnFood();
                }
            }

            // Render frozen snake during rebirth
            this.renderSnake(state);
            return; // Skip normal logic
        }

        // --- NORMAL / CRASHING LOGIC ---
        state.moveTimer++;
        if (state.moveTimer > SPEED_THROTTLE) {
            state.moveTimer = 0;

            if (!state.food && state.mode === 'playing') this.spawnFood();

            // 1. Determine Direction
            if (state.mode === 'playing') {
                // Determine if we should switch to crashing
                if (state.segments.length > 20) { // Limit reached
                    state.mode = 'crashing';
                } else {
                    // Normal playing logic
                    const nextMove = this.findPathToFood(state);
                    if (nextMove) {
                        state.direction = nextMove;
                    } else {
                        const safeMoves = this.getSafeMoves(state.segments[0], state);
                        if (safeMoves.length > 0) {
                            state.direction = safeMoves[Math.floor(Math.random() * safeMoves.length)];
                        }
                        // If trapped, will naturally crash next step
                    }
                }
            } else if (state.mode === 'crashing') {
                // Seek nearest wall to crash into
                const head = state.segments[0];
                // Find shortest distance to any wall
                const distLeft = head.c;
                const distRight = state.cols - 1 - head.c;
                const distTop = head.r;
                const distBottom = state.rows - 1 - head.r;

                if (distLeft <= Math.min(distRight, distTop, distBottom)) state.direction = { c: -1, r: 0 };
                else if (distRight <= Math.min(distLeft, distTop, distBottom)) state.direction = { c: 1, r: 0 };
                else if (distTop <= Math.min(distLeft, distRight, distBottom)) state.direction = { c: 0, r: -1 };
                else state.direction = { c: 0, r: 1 };
            }

            // 2. Move Head
            const head = state.segments[0];
            const newHead = {
                c: head.c + state.direction.c,
                r: head.r + state.direction.r,
                char: Math.random() > 0.5 ? '1' : '0'
            };

            // 3. Collision Check (Wall only, or self)
            if (newHead.c < 0 || newHead.c >= state.cols ||
                newHead.r < 0 || newHead.r >= state.rows) {
                // CRASHED!
                state.mode = 'rebirthing';
                state.rebirthStep = 0;
                return; // Stop update, next frame triggers rebirth animation
            }

            // Add new head
            state.segments.unshift(newHead);

            // Eat Food
            if (state.mode === 'playing' && state.food && newHead.c === state.food.c && newHead.r === state.food.r) {
                state.maxLength += 1; // Grow faster for demo
                state.food = null;
            }

            // Trim
            if (state.segments.length > state.maxLength) {
                state.segments.pop();
            }
        }

        // --- Rendering ---
        if (state.mode === 'playing' && state.food) {
            this.renderFood(state);
        }
        this.renderSnake(state);
    }

    renderFood(state) {
        if (!state.food) return;
        const fx = state.food.c * state.gridSize + state.gridSize / 2;
        const fy = state.food.r * state.gridSize + state.gridSize / 2;
        const time = Date.now() / 200;

        this.ctx.font = 'bold 24px Roboto Mono';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.save();
        this.ctx.translate(fx, fy);
        const scale = 1 + Math.sin(time) * 0.15;
        this.ctx.scale(scale, scale);
        this.ctx.fillStyle = '#FFD700';
        this.ctx.shadowColor = '#FFD700';
        this.ctx.shadowBlur = 25;
        this.ctx.fillText('0', 0, 0);
        this.ctx.restore();
    }

    renderSnake(state) {
        this.ctx.font = 'bold 16px Roboto Mono';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        state.segments.forEach((seg, index) => {
            const x = seg.c * state.gridSize + state.gridSize / 2;
            const y = seg.r * state.gridSize + state.gridSize / 2;
            const alpha = 1 - (index / state.segments.length);
            const isHead = index === 0;

            this.ctx.save();
            if (seg.isSpecial) {
                this.ctx.fillStyle = '#00FF88'; // Special text color (Green/Cyan)
                this.ctx.shadowColor = '#00FF88';
                this.ctx.shadowBlur = 20;
                this.ctx.font = 'bold 20px Roboto Mono'; // Bigger font for special text
            } else if (isHead) {
                this.ctx.fillStyle = '#FF0000';
                this.ctx.shadowColor = '#FF0000';
                this.ctx.shadowBlur = 15;
            } else {
                this.ctx.fillStyle = `rgba(255, ${69 * (1 - alpha)}, 0, ${alpha})`;
                this.ctx.shadowBlur = 0;
            }
            this.ctx.fillText(seg.char, x, y);
            this.ctx.restore();
        });
    }

    spawnFood() {
        const state = this.snakeState;
        let valid = false;
        let c, r;
        let attempts = 0;

        while (!valid && attempts < 100) {
            c = Math.floor(Math.random() * state.cols);
            r = Math.floor(Math.random() * state.rows);
            // Check collision with snake
            if (!state.segments.some(s => s.c === c && s.r === r)) {
                valid = true;
            }
            attempts++;
        }

        if (valid) {
            this.snakeState.food = { c, r };
        }
    }

    getSafeMoves(head, state) {
        const moves = [{ c: 0, r: -1 }, { c: 0, r: 1 }, { c: -1, r: 0 }, { c: 1, r: 0 }];
        return moves.filter(move => {
            const nc = head.c + move.c;
            const nr = head.r + move.r;
            // Check Walls
            if (nc < 0 || nc >= state.cols || nr < 0 || nr >= state.rows) return false;
            // Check Tail (Self)
            // Note: Tail tip will move, so strictly speaking coordinate of last segment is safe,
            // but ignoring it is safer to avoid precise timing bugs.
            if (state.segments.some(s => s.c === nc && s.r === nr)) return false;
            return true;
        });
    }

    findPathToFood(state) {
        if (!state.food) return null;

        const head = state.segments[0];
        const goal = state.food;

        // BFS
        const queue = [{ c: head.c, r: head.r, path: [] }];
        const visited = new Set();
        visited.add(`${head.c},${head.r}`);

        // Mark snake body as visited (obstacles)
        // Optimization: Don't mark tail tip if we want to chase tail, but keep it simple.
        for (let i = 1; i < state.segments.length - 1; i++) {
            visited.add(`${state.segments[i].c},${state.segments[i].r}`);
        }

        while (queue.length > 0) {
            // Optimization: Limit search depth/time for performance? 
            // Grid is small enough (80x25 approx), BFS is instant.

            const current = queue.shift();

            if (current.c === goal.c && current.r === goal.r) {
                return current.path[0]; // Return first move
            }

            const moves = [{ c: 0, r: -1 }, { c: 0, r: 1 }, { c: -1, r: 0 }, { c: 1, r: 0 }];

            // Randomize move order to make movement look less robotic/diagonal
            moves.sort(() => Math.random() - 0.5);

            for (const move of moves) {
                const nc = current.c + move.c;
                const nr = current.r + move.r;
                const key = `${nc},${nr}`;

                if (nc >= 0 && nc < state.cols && nr >= 0 && nr < state.rows && !visited.has(key)) {
                    visited.add(key);
                    const newPath = [...current.path, move];
                    queue.push({ c: nc, r: nr, path: newPath });
                }
            }
        }
        return null; // No path found
    }

    drawRecordingVisual() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const time = Date.now() / 100;

        this.ctx.beginPath();
        this.ctx.strokeStyle = '#FF0000';
        this.ctx.lineWidth = 2;
        this.ctx.shadowColor = '#FF0000';
        this.ctx.shadowBlur = 10;

        for (let x = 0; x < this.canvas.width; x += 3) {
            const distFromCenter = Math.abs(x - centerX) / (this.canvas.width / 2);
            const amplitude = (1 - distFromCenter) * 40;
            const frequency = 0.05;
            const y = centerY + Math.sin(x * frequency + time) * amplitude * Math.sin(time * 0.3);

            if (x === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;

        for (let i = 0; i < 3; i++) {
            const radius = 20 + i * 20 + Math.sin(time * 0.5 + i) * 10;
            const opacity = 0.3 - i * 0.1;

            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            this.ctx.strokeStyle = `rgba(255, 0, 0, ${opacity})`;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }
    }

    drawProcessingVisual() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const time = Date.now() / 1000;

        // Re-initialize if canvas size changes drastically or first run
        if (!this.processingNodes || this.lastCanvasWidth !== width) {
            this.lastCanvasWidth = width;
            this.processingNodes = [];

            // Calculate number of layers to fill width
            // Spacing roughly 150px
            const paddingX = 100;
            const usableWidth = width - (paddingX * 2);
            const layers = Math.floor(usableWidth / 120);
            const nodesPerLayer = 6;

            for (let i = 0; i < layers; i++) {
                // Map layer i to x position (centered around 0)
                const layerX = (i / (layers - 1)) * usableWidth - (usableWidth / 2);

                for (let j = 0; j < nodesPerLayer; j++) {
                    // Spread dots vertically with some randomness
                    // Height is small (~196), keep within -80 to +80
                    const ySpread = height * 0.4;
                    const y = (Math.random() - 0.5) * 2 * ySpread;

                    // Z depth for 3D effect (without rotation, just scale/fade)
                    const z = (Math.random() - 0.5) * 100;

                    this.processingNodes.push({
                        x: layerX + (Math.random() - 0.5) * 30, // Slight jitter
                        y: y,
                        z: z,
                        baseR: 2 + Math.random() * 2,
                        pulseOffset: Math.random() * Math.PI * 2,
                        layer: i
                    });
                }
            }

            // Generate connections
            this.processingConnections = [];
            for (let i = 0; i < this.processingNodes.length; i++) {
                const nodeA = this.processingNodes[i];
                // Connect only to next layer to form a flow
                const potentialNeighbors = this.processingNodes.filter(n => n.layer === nodeA.layer + 1);

                // Connect to random nodes in next layer (fully connected usually too messy, pick 2-3)
                const neighbors = potentialNeighbors.sort(() => 0.5 - Math.random()).slice(0, 3);

                for (const nodeB of neighbors) {
                    this.processingConnections.push({
                        a: nodeA,
                        b: nodeB,
                        offset: Math.random() * 10
                    });
                }
            }
        }

        // No rotation
        const rotX = 0;
        const rotY = 0;

        const perspective = 800; // Flatter perspective

        this.ctx.save();
        this.ctx.translate(centerX, centerY);

        // Project nodes (simplified projection since no rotation)
        const projectedNodes = this.processingNodes.map(node => {
            // Apply slight ambient wave movement
            const waveY = Math.sin(time + node.x * 0.01) * 5;

            const x = node.x;
            const y = node.y + waveY;
            const z = node.z;

            const scale = perspective / (perspective + z + 300);
            const alpha = Math.min(1, Math.max(0.1, scale));

            return {
                x: x * scale,
                y: y * scale,
                scale: scale,
                z: z,
                alpha: alpha,
                original: node
            };
        });

        // Sort by Z
        projectedNodes.sort((a, b) => b.z - a.z);

        // Draw connections
        this.processingConnections.forEach(conn => {
            const nodeA = projectedNodes.find(n => n.original === conn.a);
            const nodeB = projectedNodes.find(n => n.original === conn.b);

            if (!nodeA || !nodeB) return;

            const avgAlpha = (nodeA.alpha + nodeB.alpha) / 2;

            this.ctx.beginPath();
            this.ctx.moveTo(nodeA.x, nodeA.y);
            this.ctx.lineTo(nodeB.x, nodeB.y);
            this.ctx.strokeStyle = `rgba(0, 255, 136, ${avgAlpha * 0.15})`;
            this.ctx.lineWidth = 1 * ((nodeA.scale + nodeB.scale) / 2);
            this.ctx.stroke();

            // Data packets
            const packetPhase = (time * 3 + conn.offset) % 1; // Faster data flow
            const packetX = nodeA.x + (nodeB.x - nodeA.x) * packetPhase;
            const packetY = nodeA.y + (nodeB.y - nodeA.y) * packetPhase;
            const packetScale = (nodeA.scale + nodeB.scale) / 2;

            this.ctx.beginPath();
            this.ctx.arc(packetX, packetY, 2 * packetScale, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(255, 255, 255, ${avgAlpha * 0.9})`;
            this.ctx.shadowBlur = 4;
            this.ctx.shadowColor = '#fff';
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        });

        // Draw nodes
        projectedNodes.forEach(node => {
            const pulse = Math.sin(time * 5 + node.original.pulseOffset) * 0.3 + 1;
            const radius = node.original.baseR * node.scale * pulse;

            // Glow
            const gradient = this.ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, radius * 4);
            gradient.addColorStop(0, `rgba(212, 175, 55, ${node.alpha})`);
            gradient.addColorStop(0.4, `rgba(212, 175, 55, ${node.alpha * 0.4})`);
            gradient.addColorStop(1, 'rgba(212, 175, 55, 0)');

            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, radius * 4, 0, Math.PI * 2);
            this.ctx.fill();

            // Core
            this.ctx.fillStyle = `rgba(255, 220, 100, ${node.alpha})`;
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // Text overlay
        const texts = ['PROCESSING...', 'NEURAL LINK ACTIVE', 'SYNTHESIZING...'];
        const textIndex = Math.floor(time / 1.5) % texts.length;
        const text = texts[textIndex];

        this.ctx.font = 'bold 16px Roboto Mono';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = `rgba(0, 255, 136, ${0.7 + Math.sin(time * 4) * 0.3})`;
        this.ctx.letterSpacing = '3px';
        this.ctx.shadowColor = '#00ff88';
        this.ctx.shadowBlur = 10;
        this.ctx.fillText(text, 0, 0); // Center on canvas
        this.ctx.shadowBlur = 0;

        this.ctx.restore();
    }

    drawPlayingVisual() {
        const time = Date.now() / 100;
        const barCount = 32;
        const barWidth = (this.canvas.width - 60) / barCount;
        const maxHeight = this.canvas.height - 40;

        for (let i = 0; i < barCount; i++) {
            const x = 30 + i * barWidth;
            const heightMultiplier = Math.sin(i * 0.3 + time * 0.5) * 0.5 + 0.5;
            const height = heightMultiplier * maxHeight * 0.7;
            const y = (this.canvas.height - height) / 2;

            const gradient = this.ctx.createLinearGradient(x, y, x, y + height);
            gradient.addColorStop(0, 'rgba(0, 255, 136, 0.8)');
            gradient.addColorStop(0.5, 'rgba(0, 255, 136, 1)');
            gradient.addColorStop(1, 'rgba(0, 255, 136, 0.8)');

            this.ctx.fillStyle = gradient;
            this.ctx.shadowColor = '#00ff88';
            this.ctx.shadowBlur = 5;
            this.ctx.fillRect(x, y, barWidth - 2, height);
        }
        this.ctx.shadowBlur = 0;
    }
}

// ============================================
// WEB SPEECH API - 語音識別
// ============================================
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        console.error('瀏覽器不支援 Speech Recognition API');
        return null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = CONFIG.speechRecognition.language;
    recognition.continuous = CONFIG.speechRecognition.continuous;
    recognition.interimResults = CONFIG.speechRecognition.interimResults;

    recognition.onstart = () => {
        console.log('[STT] 開始語音識別');
    };

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }

        // 更新顯示（即時顯示中間結果）
        if (elements.userInputContent) {
            elements.userInputContent.textContent = finalTranscript || interimTranscript || '正在聆聽...';
        }

        if (finalTranscript) {
            recognizedText = finalTranscript;
            console.log('[STT] 識別結果:', recognizedText);
        }
    };

    recognition.onerror = (event) => {
        console.error('[STT] 錯誤:', event.error);
        if (event.error === 'no-speech') {
            if (elements.userInputContent) {
                elements.userInputContent.textContent = '未偵測到語音，請再試一次';
            }
        }
    };

    recognition.onend = () => {
        console.log('[STT] 語音識別結束');
        // 如果還在錄音狀態，自動停止錄音
        if (currentState === AppState.RECORDING) {
            stopRecording();
        }
    };

    return recognition;
}

// ============================================
// STATE TRANSITIONS
// ============================================
function setState(newState) {
    currentState = newState;
    updateUI();
}

function updateUI() {
    elements.statusValue.className = 'status-value ' + currentState;
    elements.statusValue.textContent = currentState.toUpperCase();

    elements.recordBtn.className = 'record-btn ' + currentState;

    switch (currentState) {
        case AppState.IDLE:
            elements.recordLabel.textContent = '點擊開始錄音';
            elements.recordLabel.classList.remove('active');
            if (elements.processingVideo) {
                elements.processingVideo.style.display = 'none';
                elements.processingVideo.pause();
            }
            elements.visualizationCanvas.style.opacity = '1';
            break;
        case AppState.RECORDING:
            elements.recordLabel.textContent = '錄音中...點擊停止';
            elements.recordLabel.classList.add('active');
            if (elements.processingVideo) {
                elements.processingVideo.style.display = 'none';
                elements.processingVideo.pause();
            }
            elements.visualizationCanvas.style.opacity = '1';
            break;
        case AppState.PROCESSING:
            elements.recordLabel.textContent = 'AI 處理中...';
            elements.recordLabel.classList.remove('active');
            if (elements.processingVideo) {
                elements.processingVideo.style.display = 'block';
                elements.processingVideo.play().catch(e => console.log('Video play error:', e));
            }
            elements.visualizationCanvas.style.opacity = '0'; // Hide canvas to show video fully
            break;
        case AppState.PLAYING:
            elements.recordLabel.textContent = '播放回應中';
            elements.recordLabel.classList.remove('active');
            if (elements.processingVideo) {
                elements.processingVideo.style.display = 'none';
                elements.processingVideo.pause();
            }
            elements.visualizationCanvas.style.opacity = '1';
            break;
    }

    visualizer.start(currentState);
}

// ============================================
// RECORDING LOGIC
// ============================================
function startRecording() {
    if (currentState !== AppState.IDLE) return;

    // 初始化語音識別
    if (!speechRecognition) {
        speechRecognition = initSpeechRecognition();
        if (!speechRecognition) {
            alert('您的瀏覽器不支援語音識別，請使用 Chrome 瀏覽器');
            return;
        }
    }

    // 重置識別文字
    recognizedText = '';

    // 顯示用戶輸入區域
    if (elements.userInputArea) {
        elements.userInputArea.classList.add('visible');
        elements.userInputContent.textContent = '正在聆聽...';
    }

    setState(AppState.RECORDING);
    recordingStartTime = Date.now();

    // 顯示計時器
    elements.timerDisplay.classList.add('visible');
    updateTimer();
    timerInterval = setInterval(updateTimer, 100);

    // 開始語音識別
    try {
        speechRecognition.start();
    } catch (e) {
        console.error('[STT] 啟動失敗:', e);
    }
}

function updateTimer() {
    const elapsed = Date.now() - recordingStartTime;
    const seconds = Math.floor(elapsed / 1000);
    const centiseconds = Math.floor((elapsed % 1000) / 10);
    elements.timerDisplay.textContent =
        `${String(seconds).padStart(2, '0')}:${String(centiseconds).padStart(2, '0')}`;
}

function stopRecording() {
    if (currentState !== AppState.RECORDING) return;

    clearInterval(timerInterval);
    elements.timerDisplay.classList.remove('visible');

    // 停止語音識別
    if (speechRecognition) {
        try {
            speechRecognition.stop();
        } catch (e) {
            console.error('[STT] 停止失敗:', e);
        }
    }

    // 檢查是否有識別到文字
    if (recognizedText && recognizedText.trim()) {
        startProcessing(recognizedText);
    } else {
        // 沒有識別到文字，返回 IDLE
        if (elements.userInputContent) {
            elements.userInputContent.textContent = '未識別到語音';
        }
        setTimeout(() => {
            resetApp();
        }, 1500);
    }
}

// ============================================
// PROCESSING LOGIC - 呼叫後端 API（串流版本）
// ============================================
async function startProcessing(userText) {
    setState(AppState.PROCESSING);

    console.log('[API] 發送請求:', userText);

    try {
        // 呼叫後端 chat/stream API
        const response = await fetch(`${CONFIG.apiBaseUrl}/api/chat/stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify({
                text: userText,
                stream_chunk_size: 20
            })
        });

        if (!response.ok) {
            throw new Error(`API 錯誤: ${response.status}`);
        }

        // 取得 AI 回應文字（從 header）
        const aiResponseHeader = response.headers.get('X-AI-Response');
        let aiResponse = '';
        if (aiResponseHeader) {
            aiResponse = decodeURIComponent(aiResponseHeader);
            console.log('[API] AI 回應:', aiResponse);
        }

        // 取得預估 chunk 數量（從 header）
        const estimatedChunksHeader = response.headers.get('X-Estimated-Chunks');
        const estimatedChunks = estimatedChunksHeader ? parseInt(estimatedChunksHeader) : 10;
        console.log('[API] 預估 chunks:', estimatedChunks);

        // 改為：等待完全接收後再播放
        await startFullPlayback(response, aiResponse || '收到回應');

    } catch (error) {
        console.error('[API] 錯誤:', error);
        elements.transcriptContent.innerHTML = `<span style="color: #ff4444;">錯誤: ${error.message}</span>`;
        elements.transcriptArea.classList.add('visible');

        setTimeout(() => {
            setState(AppState.IDLE);
        }, 3000);
    }
}

function typeText(text) {
    return new Promise((resolve) => {
        let index = 0;
        const speed = 30;

        function type() {
            if (index < text.length) {
                const char = text[index];
                if (char === '\n') {
                    elements.transcriptContent.innerHTML += '<br>';
                } else {
                    elements.transcriptContent.innerHTML += char;
                }
                index++;
                setTimeout(type, speed);
            } else {
                elements.transcriptContent.innerHTML += '<span class="cursor-blink">_</span>';
                resolve();
            }
        }

        type();
    });
}

// ============================================
// STREAMING PLAYBACK - 智能緩衝串流播放
// ============================================
let streamingAudioContext = null;
let nextPlayTime = 0;
let streamStartTime = 0;
let totalDuration = 0;
let chunkCount = 0;
let playbackStarted = false;
let progressInterval = null;

// ============================================
// FULL PLAYBACK - 完全接收後播放（非串流）
// ============================================
async function startFullPlayback(response, aiResponse) {
    // 保持 PROCESSING 狀態
    elements.progressContainer.classList.add('visible');
    elements.progressFill.style.width = '0%';
    elements.progressTime.textContent = '接收音訊中...';

    // 讀取完整串流
    const reader = response.body.getReader();
    let chunks = [];
    let receivedLength = 0;

    while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        chunks.push(value);
        receivedLength += value.length;

        elements.progressTime.textContent = `接收中: ${(receivedLength / 1024).toFixed(1)} KB`;
    }

    console.log(`[Audio] 接收完成，總大小: ${(receivedLength / 1024).toFixed(1)} KB`);

    // 合併 Buffer
    const allChunks = new Uint8Array(receivedLength);
    let position = 0;
    for (let chunk of chunks) {
        allChunks.set(chunk, position);
        position += chunk.length;
    }

    // 轉為 Blob 並播放
    const blob = new Blob([allChunks], { type: 'audio/wav' });
    const audioUrl = URL.createObjectURL(blob);
    audioPlayer = new Audio(audioUrl);

    // 開始播放時切換狀態
    audioPlayer.onplay = () => {
        setState(AppState.PLAYING);

        // 顯示 AI 回應文字
        if (aiResponse) {
            elements.transcriptContent.innerHTML = '';
            elements.transcriptArea.classList.add('visible');
            typeText(aiResponse);
        }
    };

    // 更新進度條
    audioPlayer.ontimeupdate = () => {
        if (audioPlayer.duration) {
            const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
            elements.progressFill.style.width = `${progress}%`;
            elements.progressTime.textContent = `${formatTime(audioPlayer.currentTime)} / ${formatTime(audioPlayer.duration)}`;
        }
    };

    // 播放結束處理
    audioPlayer.onended = () => {
        elements.progressFill.style.width = '100%';
        console.log('[Audio] 播放結束');

        // 自動重置
        setTimeout(() => {
            console.log('[AutoReset] 自動重置應用程式');
            resetApp();
        }, 2000);
    };

    // 錯誤處理
    audioPlayer.onerror = (e) => {
        console.error('[Audio] 播放錯誤:', e);
        elements.progressTime.textContent = '播放失敗';
    };

    // 開始播放
    try {
        await audioPlayer.play();
    } catch (e) {
        console.error('[Audio] 無法啟動播放:', e);
    }
}

async function fallbackPlayback(arrayBuffer) {
    console.log('[Fallback] 使用傳統方式播放');

    const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);

    audioPlayer = new Audio(url);

    audioPlayer.onloadedmetadata = () => {
        console.log('[Fallback] 音訊長度:', audioPlayer.duration, '秒');
    };

    audioPlayer.ontimeupdate = () => {
        if (audioPlayer.duration) {
            const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
            elements.progressFill.style.width = `${progress}%`;
            elements.progressTime.textContent = `${formatTime(audioPlayer.currentTime)} / ${formatTime(audioPlayer.duration)}`;
        }
    };

    audioPlayer.onended = () => {
        elements.progressFill.style.width = '100%';
    };

    try {
        await audioPlayer.play();
    } catch (e) {
        console.error('[Fallback] 播放失敗:', e);
    }
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

// ============================================
// RESET LOGIC
// ============================================
function resetApp() {
    // 停止語音識別
    if (speechRecognition) {
        try {
            speechRecognition.stop();
        } catch (e) { }
    }

    // 停止音訊播放
    isAppResetting = true; // 標記正在重置

    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
        audioPlayer = null;
    }

    // 停止 AudioContext
    if (streamingAudioContext && streamingAudioContext.state !== 'closed') {
        streamingAudioContext.close().catch(() => { });
        streamingAudioContext = null;
    }

    // 重置串流狀態
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
    totalDuration = 0;
    chunkCount = 0;
    playbackStarted = false;
    audioBufferQueue = [];
    packetTimes = [];
    bufferedDuration = 0;

    // 清除計時器
    clearInterval(timerInterval);
    recognizedText = '';

    // 重置 UI
    elements.timerDisplay.classList.remove('visible');
    elements.timerDisplay.textContent = '00:00';
    elements.transcriptArea.classList.remove('visible');
    elements.transcriptContent.innerHTML = '<span class="cursor-blink">_</span>';
    elements.progressContainer.classList.remove('visible');
    elements.progressFill.style.width = '0%';
    elements.progressTime.textContent = '0:00 / 0:00';

    if (elements.userInputArea) {
        elements.userInputArea.classList.remove('visible');
        elements.userInputContent.textContent = '';
    }

    // 重置狀態
    setState(AppState.IDLE);
    visualizer.stop();
}

// ============================================
// EVENT LISTENERS
// ============================================
elements.recordBtn.addEventListener('click', () => {
    if (currentState === AppState.IDLE) {
        startRecording();
    } else if (currentState === AppState.RECORDING) {
        stopRecording();
    }
});

elements.resetBtn.addEventListener('click', resetApp);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        resetApp();
    } else if (e.key === ' ' && currentState === AppState.IDLE) {
        e.preventDefault();
        startRecording();
    }
});

// ============================================
// INITIALIZATION
// ============================================
const matrixBg = new MatrixBackground(elements.matrixCanvas);
const visualizer = new VisualizationAnimator(elements.visualizationCanvas);

// 初始狀態
setState(AppState.IDLE);
visualizer.start(AppState.IDLE);

console.log('🔮 Code Alchemist initialized. Ready to transmute voice into code!');
console.log(`📡 API Server: ${CONFIG.apiBaseUrl}`);
