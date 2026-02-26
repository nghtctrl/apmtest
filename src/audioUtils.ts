import { Mp3Encoder } from "@breezystack/lamejs";

/**
 * Remove a time range from an audio Blob, returning a new WAV Blob with the
 * segment between `startSec` and `endSec` spliced out.
 * Preserves all channels and sample rate.
 */
export async function spliceAudio(
  blob: Blob,
  startSec: number,
  endSec: number,
): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);

  const sampleRate = decoded.sampleRate;
  const numChannels = decoded.numberOfChannels;
  const startSample = Math.round(startSec * sampleRate);
  const endSample = Math.round(endSec * sampleRate);
  const totalSamples = decoded.length;

  const newLength = totalSamples - (endSample - startSample);
  if (newLength <= 0) {
    await audioCtx.close();
    // Nothing left — return a tiny silent WAV
    return new Blob([], { type: "audio/wav" });
  }

  const offlineCtx = new OfflineAudioContext(
    numChannels,
    newLength,
    sampleRate,
  );
  const newBuffer = offlineCtx.createBuffer(
    numChannels,
    newLength,
    sampleRate,
  );

  for (let ch = 0; ch < numChannels; ch++) {
    const src = decoded.getChannelData(ch);
    const dst = newBuffer.getChannelData(ch);
    // Copy before the cut
    dst.set(src.subarray(0, startSample), 0);
    // Copy after the cut
    dst.set(src.subarray(endSample), startSample);
  }

  // Render to get a proper AudioBuffer, then encode to WAV
  const source = offlineCtx.createBufferSource();
  source.buffer = newBuffer;
  source.connect(offlineCtx.destination);
  source.start();
  const rendered = await offlineCtx.startRendering();
  await audioCtx.close();

  return audioBufferToWav(rendered);
}

/** Encode an AudioBuffer as a WAV Blob. */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave channel data as 16-bit PCM
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true,
      );
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Compress an audio file (any browser-supported format) to mono MP3 at the
 * given bitrate. Returns the result as a Blob with type "audio/mpeg".
 */
export async function compressToMp3(
  file: File,
  kbps: number
): Promise<Blob> {
  // 1. Decode the file into raw PCM using the browser's AudioContext
  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = new AudioContext();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  // 2. Down-mix to mono
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  let monoSamples: Float32Array;

  if (numChannels === 1) {
    monoSamples = audioBuffer.getChannelData(0);
  } else {
    // Average all channels
    monoSamples = new Float32Array(audioBuffer.length);
    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < audioBuffer.length; i++) {
        monoSamples[i] += channelData[i] / numChannels;
      }
    }
  }

  // 3. Convert Float32 (-1..1) to Int16
  const int16 = new Int16Array(monoSamples.length);
  for (let i = 0; i < monoSamples.length; i++) {
    const s = Math.max(-1, Math.min(1, monoSamples[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  // 4. Encode with lamejs
  const encoder = new Mp3Encoder(1, sampleRate, kbps);
  const mp3Chunks: ArrayBuffer[] = [];
  const BLOCK = 1152; // lamejs recommended block size

  for (let i = 0; i < int16.length; i += BLOCK) {
    const chunk = int16.subarray(i, i + BLOCK);
    const encoded = encoder.encodeBuffer(chunk);
    if (encoded.length > 0) mp3Chunks.push(encoded.buffer.slice(0) as ArrayBuffer);
  }

  const last = encoder.flush();
  if (last.length > 0) mp3Chunks.push(last.buffer.slice(0) as ArrayBuffer);

  await audioCtx.close();

  return new Blob(mp3Chunks, { type: "audio/mpeg" });
}
