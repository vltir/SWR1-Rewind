<script setup>
import { ref, onMounted } from 'vue'

// --- ZUSTANDS-VARIABLEN (STATE) ---
const songs = ref([])
const currentSong = ref(null)
const isPlaying = ref(false)
const isRevealed = ref(false)
const isLoading = ref(false)
const statusMessage = ref('')

let audioCtx = null

// --- LOGIK ---

// 1. Songs laden beim Start
onMounted(async () => {
  try {
    const res = await fetch('/swr1_songs.json') // Lädt aus dem public Ordner
    songs.value = await res.json()
    statusMessage.value = `${songs.value.length} Songs bereit!`
  } catch (e) {
    statusMessage.value = 'Fehler: swr1_songs.json nicht gefunden.'
  }
})

// 2. Audio Logik
async function playRandomSong() {
  if (songs.value.length === 0) return

  // UI Reset
  isRevealed.value = false
  isPlaying.value = true
  isLoading.value = true
  statusMessage.value = "Lade & Schneide..." // Kleines Update im Text

  const randomIndex = Math.floor(Math.random() * songs.value.length)
  currentSong.value = songs.value[randomIndex]

  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    }

    // 1. Laden (mit Proxy Fix)
    const originalUrl = currentSong.value.audio
    const proxyUrl = originalUrl.replace('https://hooks.swr.de', '/swr-proxy')
    const response = await fetch(proxyUrl)
    const arrayBuffer = await response.arrayBuffer()

    // 2. Dekodieren (Vollständiges Audio inkl. Jingle)
    const fullBuffer = await audioCtx.decodeAudioData(arrayBuffer)

    // --- SCHNITT-LOGIK START ---

    // Wie viel wollen wir hinten abschneiden? (Hier: 5 Sekunden)
    // Falls der Jingle kürzer/länger ist, passe diese Zahl an (z.B. 4.5 oder 6)
    const SECONDS_TO_CUT = 7.3;

    // Berechne neue Länge: Gesamtlänge minus (SampleRate * Sekunden)
    const samplesToCut = Math.floor(fullBuffer.sampleRate * SECONDS_TO_CUT);
    const newLength = Math.max(0, fullBuffer.length - samplesToCut);

    // Erstelle einen neuen, leeren Buffer, der kürzer ist
    const trimmedBuffer = audioCtx.createBuffer(
        fullBuffer.numberOfChannels,
        newLength,
        fullBuffer.sampleRate
    );

    // Kopiere Daten UND drehe sie um
    for (let i = 0; i < fullBuffer.numberOfChannels; i++) {
      const originalData = fullBuffer.getChannelData(i);
      const newData = trimmedBuffer.getChannelData(i);

      // Wir nehmen vom Original nur den Teil von 0 bis zum Schnittpunkt (newLength)
      // .subarray ist performanter als eine Schleife
      const cutData = originalData.subarray(0, newLength);

      // Daten in den neuen Buffer füllen
      newData.set(cutData);

      // JETZT den gekürzten Teil umdrehen
      Array.prototype.reverse.call(newData);
    }
    // --- SCHNITT-LOGIK ENDE ---

    // 3. Abspielen des gekürzten Buffers
    const source = audioCtx.createBufferSource()
    source.buffer = trimmedBuffer // Wichtig: Hier den trimmedBuffer nehmen!
    source.connect(audioCtx.destination)
    source.start()

    source.onended = () => {
      isPlaying.value = false
      statusMessage.value = "Wiedergabe beendet."
    }

    isLoading.value = false
    statusMessage.value = "Läuft rückwärts (ohne Jingle)! 🎵"

  } catch (e) {
    console.error(e)
    statusMessage.value = "Fehler beim Abspielen."
    isLoading.value = false
    isPlaying.value = false
  }
}

function reveal() {
  isRevealed.value = true
  statusMessage.value = "Aufgelöst!"
}
</script>

<template>
  <div class="container">
    <div class="card">
      <h1>⏪ SWR1 Rewind</h1>

      <div class="status-bar">{{ statusMessage }}</div>

      <div class="controls">
        <button
            @click="playRandomSong"
            :disabled="isLoading"
            class="btn-primary"
        >
          {{ isLoading ? 'Lade...' : '🎲 Neuer Song (Rückwärts)' }}
        </button>

        <button
            v-if="currentSong"
            @click="reveal"
            class="btn-secondary"
        >
          👀 Auflösen
        </button>
      </div>

      <div v-if="isRevealed && currentSong" class="result animated">
        <h2>{{ currentSong.title }}</h2>
        <h3>{{ currentSong.artist }}</h3>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Ein bisschen CSS für den Look */
.container {
  display: flex; justify-content: center; align-items: center;
  min-height: 100vh; background: #1a1a1a; color: white;
  font-family: 'Segoe UI', sans-serif;
}
.card {
  background: #2c2c2c; padding: 2rem; border-radius: 12px;
  text-align: center; width: 100%; max-width: 400px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.5);
}
h1 { color: #ffcc00; margin-bottom: 0.5rem; }
.status-bar { height: 20px; font-size: 0.9rem; color: #888; margin-bottom: 20px; }
.controls { display: flex; flex-direction: column; gap: 10px; }
button {
  padding: 12px; font-size: 1rem; border: none; border-radius: 6px;
  cursor: pointer; font-weight: bold; transition: transform 0.1s;
}
button:active { transform: scale(0.98); }
.btn-primary { background: #ffcc00; color: #222; }
.btn-primary:disabled { background: #555; cursor: not-allowed; }
.btn-secondary { background: #444; color: #fff; }
.result { margin-top: 25px; padding-top: 20px; border-top: 1px solid #444; }
.result h2 { margin: 0; color: #fff; }
.result h3 { margin: 5px 0 0 0; color: #aaa; font-weight: normal; }
.animated { animation: fadeIn 0.5s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
</style>