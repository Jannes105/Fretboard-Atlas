import { useEffect, useRef } from 'react';
import { type AudioPlayer, createAudioPlayer, prefetchSamples } from '../audio';
import type { AppState } from '../urlState';

type SoundInputs = Pick<AppState, 'sound' | 'amp' | 'pickup' | 'tone' | 'reverb' | 'delay' | 'bpm'>;

/**
 * One player for the whole session, kept in step with the sound settings.
 *
 * Built lazily, so no AudioContext exists until the first play — browsers require
 * a user gesture to start audio. `player()` only builds the wrapper, which is why
 * the effects below may call it before any gesture.
 */
export function useAudioPlayer({ sound, amp, pickup, tone, reverb, delay, bpm }: SoundInputs) {
  const playerRef = useRef<AudioPlayer | null>(null);
  const player = () => (playerRef.current ??= createAudioPlayer());

  // One effect per setting: each is legal and silent when the thing it points at
  // is not in use (an amplifier under the clean voice, say), and the choice is
  // still there when it comes back into play.
  useEffect(() => {
    player().setTimbre(sound);
  }, [sound]);

  useEffect(() => {
    player().setAmp(amp);
  }, [amp]);

  useEffect(() => {
    player().setPickup(pickup);
  }, [pickup]);

  useEffect(() => {
    player().setTone(tone);
  }, [tone]);

  useEffect(() => {
    player().setReverb(reverb);
  }, [reverb]);

  useEffect(() => {
    player().setDelay(delay);
  }, [delay]);

  // The delay divides the tempo, so it is told here rather than by the transport:
  // a single chord clicked on the neck never goes through the transport, and it
  // should still echo in time.
  useEffect(() => {
    player().setTempo(bpm);
  }, [bpm]);

  // Pull the guitar recordings down as soon as the app is on screen. A fetch needs
  // neither a gesture nor an AudioContext, so by the first click the samples are
  // usually there and only need decoding.
  useEffect(() => {
    void prefetchSamples();
  }, []);

  // Silence everything when the app goes away — a scale run's timers too.
  useEffect(() => () => playerRef.current?.stop(), []);

  return player;
}
