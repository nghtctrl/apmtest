import { Mp3Encoder } from "@breezystack/lamejs";

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
