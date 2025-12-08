<script setup>
import { ref, onMounted } from 'vue'

// --- ZUSTAND (STATE) ---
const songs = ref([])
const currentSong = ref(null)      // Der Song, der gerade läuft/angezeigt wird
const isPlaying = ref(false)
const isRevealed = ref(false)
const statusMessage = ref('Initialisiere...')

// --- PRELOAD STATE (Der Puffer) ---
const nextSong = ref(null)         // Metadaten für den NÄCHSTEN Song
const nextAudioBuffer = ref(null)  // Das fertige Audio für den NÄCHSTEN Song
const isReady = ref(false)         // Ist der nächste Song abspielbereit?

let audioCtx = null

// NEU: Hier merken wir uns den aktuellen "Player", um ihn stoppen zu können
let currentSourceNode = null

// --- LOGIK ---

onMounted(async () => {
  // 1. AudioContext sofort anlegen (aber er ist noch "suspended")
  audioCtx = new (window.AudioContext || window.webkitAudioContext)()

  try {
    // 2. Liste laden
    const res = await fetch('/swr1_songs.json')
    songs.value = await res.json()
    statusMessage.value = `${songs.value.length} Songs geladen.`

    // 3. SOFORT den ersten Song vorbereiten
    await prepareNextSong()

  } catch (e) {
    statusMessage.value = 'Fehler beim Laden der JSON.'
    console.error(e)
  }
})

// Diese Funktion macht die schwere Arbeit im Hintergrund
async function prepareNextSong() {
  if (songs.value.length === 0) return

  isReady.value = false
  statusMessage.value = "Lade nächsten Song im Hintergrund..."

  // Zufälligen Song wählen (verhindern, dass es der gleiche wie gerade eben ist)
  let randomIndex
  do {
    randomIndex = Math.floor(Math.random() * songs.value.length)
  } while (currentSong.value && songs.value[randomIndex].audio === currentSong.value.audio && songs.value.length > 1)

  const selectedSong = songs.value[randomIndex]

  try {
    // A) Fetch
    const originalUrl = selectedSong.audio
    const proxyUrl = originalUrl.replace('https://hooks.swr.de', '/swr-proxy')
    const response = await fetch(proxyUrl)
    const arrayBuffer = await response.arrayBuffer()

    // B) Decode
    const fullBuffer = await audioCtx.decodeAudioData(arrayBuffer)

    // C) Schneiden & Umdrehen
    const SECONDS_TO_CUT = 7.3
    const samplesToCut = Math.floor(fullBuffer.sampleRate * SECONDS_TO_CUT)
    const newLength = Math.max(0, fullBuffer.length - samplesToCut)

    const trimmedBuffer = audioCtx.createBuffer(
        fullBuffer.numberOfChannels,
        newLength,
        fullBuffer.sampleRate
    )

    for (let i = 0; i < fullBuffer.numberOfChannels; i++) {
      const originalData = fullBuffer.getChannelData(i)
      const newData = trimmedBuffer.getChannelData(i)
      const cutData = originalData.subarray(0, newLength)
      newData.set(cutData)
      Array.prototype.reverse.call(newData)
    }

    // D) In den "Puffer"-Variablen speichern
    nextSong.value = selectedSong
    nextAudioBuffer.value = trimmedBuffer

    // Fertig!
    isReady.value = true
    // Wenn gerade nichts spielt, können wir "Bereit" anzeigen,
    // sonst lassen wir die Nachricht des laufenden Songs stehen.
    if (!isPlaying.value) {
      statusMessage.value = "Bereit für nächsten Song!"
    }

  } catch (e) {
    console.error("Fehler beim Vorladen:", e)
    // Falls einer fehlschlägt, einfach nochmal probieren
    setTimeout(prepareNextSong, 1000)
  }
}

// Diese Funktion wird beim Button-Klick ausgeführt (passiert sofort)
async function playReadySong() {
  if (!isReady.value || !nextAudioBuffer.value) return

  // 1. Browser-Policy: Context aufwecken beim ersten Klick
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume()
  }

  // --- NEU: ALTE WIEDERGABE STOPPEN ---
  if (currentSourceNode) {
    try {
      // Wichtig: Wir entfernen den Event-Listener, damit nicht "Wiedergabe beendet"
      // aufploppt, obwohl wir gerade einen neuen Song starten.
      currentSourceNode.onended = null
      currentSourceNode.stop()
    } catch (e) {
      // Falls er schon gestoppt war, egal.
    }
  }
  // ------------------------------------

  isRevealed.value = false
  isPlaying.value = true

  // 3. Den Puffer in den "Live"-Status schieben
  currentSong.value = nextSong.value // Metadaten anzeigen (aber noch verdeckt)

  // 4. Abspielen
  const source = audioCtx.createBufferSource()
  source.buffer = nextAudioBuffer.value
  source.connect(audioCtx.destination)

  // NEU: Den neuen Player in der Variable speichern
  currentSourceNode = source

  source.start()

  statusMessage.value = "Spielt ab... 🎵"

  source.onended = () => {
    isPlaying.value = false
    statusMessage.value = "Wiedergabe beendet. Rate mal!"
    // Variable leeren, da der Song physikalisch zu Ende ist
    currentSourceNode = null
  }

  // 5. WICHTIG: Sofort den NÄCHSTEN Song laden, während der User rät!
  // Wir löschen den Puffer und laden neu.
  nextAudioBuffer.value = null
  isReady.value = false
  prepareNextSong()
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
            @click="playReadySong"
            :disabled="!isReady"
            class="btn-primary"
        >
          {{ !isReady ? '⏳ Lade im Hintergrund...' : '🎲 Song abspielen (Sofort!)' }}
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
.status-bar { height: 20px; font-size: 0.9rem; color: #888; margin-bottom: 20px; transition: color 0.3s;}
.controls { display: flex; flex-direction: column; gap: 10px; }
button {
  padding: 12px; font-size: 1rem; border: none; border-radius: 6px;
  cursor: pointer; font-weight: bold; transition: all 0.2s;
}
button:active { transform: scale(0.98); }
.btn-primary { background: #ffcc00; color: #222; }
/* Wenn deaktiviert (während des Ladens): */
.btn-primary:disabled { background: #444; color: #888; cursor: wait; opacity: 0.7; }

.btn-secondary { background: #444; color: #fff; }
.result { margin-top: 25px; padding-top: 20px; border-top: 1px solid #444; }
.result h2 { margin: 0; color: #fff; }
.result h3 { margin: 5px 0 0 0; color: #aaa; font-weight: normal; }
.animated { animation: fadeIn 0.5s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
</style>