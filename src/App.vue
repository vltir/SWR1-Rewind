<script setup>
import { ref, onMounted, computed } from 'vue'

// --- ZUSTAND ---
const songs = ref([])
const currentSong = ref(null)
const isPlaying = ref(false)
const isRevealed = ref(false)
const statusMessage = ref('Lade Liste...')

// --- AUDIO SPEICHER ---
const nextAudioPackage = ref(null)
const currentAudioPackage = ref(null)
const nextSong = ref(null)
const isReady = ref(false)

let audioCtx = null
let currentSourceNode = null

// --- NEU: Der Rewind-Sound ---
// Wir erstellen das Objekt einmalig, aber laden es erst im onMounted
// Der Pfad '/rewind.mp3' zeigt direkt in den public-Ordner
const rewindSound = new Audio('/rewind.mp3')
rewindSound.volume = 0.5 // Lautstärke anpassen (0.0 bis 1.0)

const buttonText = computed(() => {
  if (songs.value.length === 0) return 'Lade Datenbank...'
  if (!currentSong.value) return isReady.value ? 'Spiel starten' : 'Lade Start...'
  if (!isRevealed.value) return 'Auflösen'
  if (!isReady.value) return 'Lade nächsten...'
  return 'Nächster Song'
})

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

    const SECONDS_TO_CUT = 7.3
    const samplesToCut = Math.floor(fullBuffer.sampleRate * SECONDS_TO_CUT)
    const newLength = Math.max(0, fullBuffer.length - samplesToCut)

    const reversedBuffer = audioCtx.createBuffer(fullBuffer.numberOfChannels, newLength, fullBuffer.sampleRate)
    const forwardBuffer = audioCtx.createBuffer(fullBuffer.numberOfChannels, newLength, fullBuffer.sampleRate)

    for (let i = 0; i < fullBuffer.numberOfChannels; i++) {
      const originalData = fullBuffer.getChannelData(i)
      const cutData = originalData.subarray(0, newLength)
      forwardBuffer.getChannelData(i).set(cutData)
      const reversedData = cutData.slice()
      Array.prototype.reverse.call(reversedData)
      reversedBuffer.getChannelData(i).set(reversedData)
    }

    nextSong.value = selectedSong
    nextAudioPackage.value = { forward: forwardBuffer, reversed: reversedBuffer }
    isReady.value = true
    if (!currentSong.value) statusMessage.value = "Bereit zum Start!"

  } catch (e) {
    console.error(e)
    setTimeout(prepareNextSong, 1000)
  }
}

async function handleMainAction() {
  if (!currentSong.value || isRevealed.value) {
    await playNextReadySong()
  } else {
    revealAndPlayOriginal()
  }
}

async function playNextReadySong() {
  if (!isReady.value || !nextAudioPackage.value) return
  if (audioCtx.state === 'suspended') await audioCtx.resume()

  // --- HIER DIE ÄNDERUNG: ---
  // Wir stoppen den laufenden Song (Original) SOFORT beim Klick.
  stopAudio()

  // 1. Reset UI
  isRevealed.value = false
  isPlaying.value = true
  currentSong.value = nextSong.value
  currentAudioPackage.value = nextAudioPackage.value

  // 2. MP3-SOUND ABSPIELEN
  try {
    rewindSound.currentTime = 0
    rewindSound.play()
  } catch(e) {
    console.log("Sound konnte nicht spielen", e)
  }

  statusMessage.value = "Spule zurück..."

  // 3. Wartezeit (angepasst an die Länge deines SFX)
  setTimeout(() => {
    playBuffer(currentAudioPackage.value.reversed)
    statusMessage.value = "Läuft rückwärts..."
  }, 600)

  nextAudioPackage.value = null
  isReady.value = false
  prepareNextSong()
}

function revealAndPlayOriginal() {
  stopAudio()

  isPlaying.value = true
  isRevealed.value = true
  statusMessage.value = "Original wird abgespielt! 🎧"

  if (currentAudioPackage.value && currentAudioPackage.value.forward) {
    playBuffer(currentAudioPackage.value.forward)
  }
}

function playBuffer(buffer) {
  stopAudio()
  const source = audioCtx.createBufferSource()
  source.buffer = buffer
  source.connect(audioCtx.destination)
  currentSourceNode = source
  source.start()

  source.onended = () => {
    if (currentSourceNode === source) {
      isPlaying.value = false
      currentSourceNode = null
      if (!isRevealed.value) statusMessage.value = "Zu Ende. Weißt du es?"
    }
  }
}

function stopAudio() {
  if (currentSourceNode) {
    try {
      currentSourceNode.onended = null
      currentSourceNode.stop()
    } catch(e) {}
    currentSourceNode = null
  }
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
        <div class="result-content" :class="{ visible: isRevealed && currentSong, 'force-hidden': isSwapping }">
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
  opacity: 0;
  transform: translateY(10px);
  /* WICHTIG: Hier KEINE transition definieren (oder 0s).
     Das bedeutet: Wenn wir in diesen Zustand wechseln (Ausblenden),
     passiert es SOFORT ohne Verzögerung.
  */
  transition: none;
}

/* AKTIVER ZUSTAND (SICHTBAR) */
.result-content.visible {
  opacity: 1;
  transform: translateY(0);

  /* WICHTIG: Die Transition steht NUR hier.
     Sie greift nur, wenn wir IN diesen Zustand wechseln (Einblenden).
  */
  transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
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