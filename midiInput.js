// midiInput.js — accès Web MIDI (piano branché en USB/Bluetooth) avec messages d'aide.
export async function initMidiInput({ onDeviceChange, onNoteOn, onNoteOff }) {
  if (!navigator.requestMIDIAccess) {
    return { supported: false, message: "Ce navigateur ne supporte pas Web MIDI. Sur iPad, ouvrez cette app dans MIDIWeb Browser (gratuit) pour brancher votre piano." };
  }
  const access = await navigator.requestMIDIAccess({ sysex: false });
  const inputs = () => [...access.inputs.values()];

  function bindAll() {
    for (const input of inputs()) {
      input.onmidimessage = (e) => {
        const [status, d1, d2] = e.data;
        const hi = status & 0xf0;
        if (hi === 0x90 && d2 > 0) onNoteOn(d1, d2);
        else if (hi === 0x80 || (hi === 0x90 && d2 === 0)) onNoteOff(d1);
      };
    }
    onDeviceChange?.(inputs());
  }

  access.onstatechange = bindAll;
  bindAll();
  return { supported: true, access, refresh: bindAll };
}
