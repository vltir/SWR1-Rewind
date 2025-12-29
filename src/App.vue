<script setup>
import { ref, onMounted, computed } from 'vue'

// --- ZUSTAND ---
const songs = ref([])
const currentSong = ref(null)
const isPlaying = ref(false)
const isRevealed = ref(false)
const statusMessage = ref('Lade Liste...')

// --- PRELOAD STATE ---
const nextSong = ref(null)
const nextAudioBuffer = ref(null)
const isReady = ref(false)

let audioCtx = null
let currentSourceNode = null

// --- COMPUTED: Der Button Text ---
const buttonText = computed(() => {
  // 1. Ganz am Anfang (Datenbank lädt noch)
  if (songs.value.length === 0) return 'Lade Datenbank...'

  // 2. Erster Start
  if (!currentSong.value) {
    return isReady.value ? 'Spiel starten' : 'Lade Start...'
  }

  // 3. Rate-Modus (Hier ist der Text fix, egal was im Hintergrund lädt!)
  if (!isRevealed.value) {
    return 'Auflösen'
  }

  // 4. Weiter-Modus (Nur hier zeigen wir an, wenn wir noch warten müssen)
  if (!isReady.value) return 'Lade nächsten Song'

  return 'Nächster Song'
})

// --- LOGIK ---

onMounted(async () => {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  try {
    const res = await fetch('/swr1_songs.json')
    songs.value = await res.json()
    statusMessage.value = `${songs.value.length} Songs in der Datenbank.`
    await prepareNextSong()
  } catch (e) {
    statusMessage.value = 'Fehler: JSON nicht gefunden.'
  }
})

async function prepareNextSong() {
  if (songs.value.length === 0) return
  isReady.value = false

  let randomIndex
  do {
    randomIndex = Math.floor(Math.random() * songs.value.length)
  } while (currentSong.value && songs.value[randomIndex].audio === currentSong.value.audio && songs.value.length > 1)

  const selectedSong = songs.value[randomIndex]

  try {
    const originalUrl = selectedSong.audio
    const proxyUrl = originalUrl.replace('https://hooks.swr.de', '/swr-proxy')
    const response = await fetch(proxyUrl)
    const arrayBuffer = await response.arrayBuffer()
    const fullBuffer = await audioCtx.decodeAudioData(arrayBuffer)

    // Schnitt & Reverse
    const SECONDS_TO_CUT = 7.3
    const samplesToCut = Math.floor(fullBuffer.sampleRate * SECONDS_TO_CUT)
    const newLength = Math.max(0, fullBuffer.length - samplesToCut)

    const trimmedBuffer = audioCtx.createBuffer(fullBuffer.numberOfChannels, newLength, fullBuffer.sampleRate)

    for (let i = 0; i < fullBuffer.numberOfChannels; i++) {
      const originalData = fullBuffer.getChannelData(i)
      const newData = trimmedBuffer.getChannelData(i)
      const cutData = originalData.subarray(0, newLength)
      newData.set(cutData)
      Array.prototype.reverse.call(newData)
    }

    nextSong.value = selectedSong
    nextAudioBuffer.value = trimmedBuffer
    isReady.value = true

    // Status nur updaten, wenn wir gerade warten (also noch nicht gestartet haben)
    if (!currentSong.value) statusMessage.value = "Bereit zum Start!"

  } catch (e) {
    console.error(e)
    setTimeout(prepareNextSong, 1000)
  }
}

async function handleMainAction() {
  // A: Starten oder Nächster Song
  if (!currentSong.value || isRevealed.value) {
    await playNextReadySong()
  }
  // B: Auflösen
  else {
    revealAndStop()
  }
}

async function playNextReadySong() {
  if (!isReady.value || !nextAudioBuffer.value) return

  if (audioCtx.state === 'suspended') await audioCtx.resume()

  // 1. Erstmal nur das Ergebnis ausblenden (alter Text verschwindet)
  isRevealed.value = false
  isPlaying.value = true

  // 2. Audio starten (Das soll sofort passieren, ohne Wartezeit)
  const source = audioCtx.createBufferSource()
  source.buffer = nextAudioBuffer.value
  source.connect(audioCtx.destination)
  currentSourceNode = source
  source.start()

  statusMessage.value = "Läuft rückwärts..."

  // 3. WICHTIG: Den Text erst austauschen, wenn die Animation vorbei ist!
  // Dein CSS hat eine Transition von ca 0.4s oder 0.5s.
  // Wir warten 500ms, damit der alte Text komplett weg ist.
  setTimeout(() => {
    currentSong.value = nextSong.value
  }, 400)

  // Event Listener für Audio-Ende
  source.onended = () => {
    isPlaying.value = false
    currentSourceNode = null
    if (!isRevealed.value) statusMessage.value = "Zu Ende. Weißt du es?"
  }

  // Hintergrund-Reload
  nextAudioBuffer.value = null
  isReady.value = false
  prepareNextSong()
}

function revealAndStop() {
  if (currentSourceNode) {
    try {
      currentSourceNode.onended = null
      currentSourceNode.stop()
    } catch(e) {}
    currentSourceNode = null
  }

  isPlaying.value = false
  isRevealed.value = true
  statusMessage.value = "Aufgelöst!"
}
</script>

<template>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>⏪ SWR1 Rewind</h1>
        <div class="status-bar">{{ statusMessage }}</div>
      </div>

      <div class="result-area">
        <div class="result-content" :class="{ visible: isRevealed && currentSong }">
          <h2 v-if="currentSong">{{ currentSong.title }}</h2>
          <h3 v-if="currentSong">{{ currentSong.artist }}</h3>
          <h2 v-else>&nbsp;</h2>
        </div>
      </div>

      <div class="controls">
        <button
            @click="handleMainAction"
            :disabled="(!isReady && !currentSong) || (isRevealed && !isReady)"
            class="main-btn"
        >
          {{ buttonText }}
        </button>
      </div>

    </div>
  </div>
</template>

<style scoped>
.container {
  display: flex; justify-content: center; align-items: center;
  min-height: 100vh; background: #1a1a1a; color: white;
  font-family: 'Segoe UI', sans-serif;
}

.card {
  background: #2c2c2c;
  padding: 2.5rem;
  border-radius: 16px;
  text-align: center;
  width: 90vw;
  max-width: 420px;
  box-sizing: border-box;
  box-shadow: 0 15px 40px rgba(0,0,0,0.6);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

h1 { color: #ffcc00; margin: 0; font-size: 1.8rem; letter-spacing: -0.5px; }

.status-bar {
  height: 20px;
  font-size: 0.9rem;
  color: #888;
  margin-top: 5px;
}

/* --- RESULT AREA: FIXIERTE HÖHE --- */
.result-area {
  height: 100px; /* Reservierter Platz: Verhindert Springen */
  display: flex;
  align-items: center;
  justify-content: center;
  border-top: 1px solid #3a3a3a;
  border-bottom: 1px solid #3a3a3a;
  background: rgba(0,0,0,0.1);
  border-radius: 8px;
}

.result-content {
  opacity: 0; /* Standardmäßig unsichtbar, aber nimmt Platz ein */
  transform: translateY(10px);
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.result-content.visible {
  opacity: 1;
  transform: translateY(0);
}

.result-content h2 { margin: 0; color: #fff; font-size: 1.4rem; line-height: 1.2; }
.result-content h3 { margin: 5px 0 0 0; color: #aaa; font-weight: normal; font-size: 1rem; }

/* --- BUTTON STYLES --- */
.controls { display: flex; flex-direction: column; }

.main-btn {
  /* HIER IST JETZT DIE FESTE FARBE (SWR1 Gelb) */
  background: #ffcc00;
  color: #222;

  padding: 18px;
  font-size: 1.2rem;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 800;
  transition: all 0.2s ease;
  width: 100%;
  box-shadow: 0 4px 0 rgba(0,0,0,0.2);
}

.main-btn:active { transform: translateY(2px); box-shadow: none; }

/* Das bleibt wichtig: Wenn er lädt, wird er grau */
.main-btn:disabled {
  background: #444;
  color: #888;
  cursor: wait;
  box-shadow: none;
}

</style>