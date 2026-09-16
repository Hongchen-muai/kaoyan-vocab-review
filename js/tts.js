/* 发音：Web Speech API */
(function (global) {
  let voice = null;
  let rate = 0.9;

  function pickVoice() {
    if (!("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    const prefer = [
      /^en(-|_)?US/i, /^en(-|_)?GB/i, /^English/i, /^en/i,
    ];
    for (const re of prefer) {
      const v = voices.find((x) => re.test(x.lang || "") || re.test(x.name || ""));
      if (v) return v;
    }
    return voices.find((v) => /en/i.test(v.lang || "")) || voices[0];
  }

  function init() {
    if (!("speechSynthesis" in window)) return;
    voice = pickVoice();
    window.speechSynthesis.onvoiceschanged = () => { voice = pickVoice(); };
  }

  function setRate(r) {
    rate = Number(r) || 0.9;
  }

  function speak(text, onEnd) {
    if (!("speechSynthesis" in window)) {
      if (onEnd) onEnd(false);
      return false;
    }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text || ""));
      u.lang = "en-US";
      u.rate = rate;
      u.pitch = 1;
      if (voice) u.voice = voice;
      u.onend = () => onEnd && onEnd(true);
      u.onerror = () => onEnd && onEnd(false);
      window.speechSynthesis.speak(u);
      return true;
    } catch (e) {
      if (onEnd) onEnd(false);
      return false;
    }
  }

  global.TTS = { init, speak, setRate };
})(window);
