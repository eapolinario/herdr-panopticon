"""Original 16-bar synth bed and interaction sounds. No samples or recorded audio."""
import wave

import numpy as np

RATE = 48000
DURATION = 32


def write_score(path, cues):
    mix = np.zeros((DURATION * RATE, 2), dtype=np.float32)
    rng = np.random.default_rng(21)
    tau = 2 * np.pi

    def clock(length):
        return np.arange(round(length * RATE)) / RATE

    def put(at, signal, pan=0):
        start = round(at * RATE)
        if start >= len(mix):
            return
        s = signal[:len(mix) - start]
        mix[start:start + len(s)] += s[:, None] * np.sqrt([(1 - pan) / 2, (1 + pan) / 2])

    def hz(midi):
        return 440 * 2 ** ((midi - 69) / 12)

    def pluck(at, midi, gain, pan=0, tail=.38):
        t = clock(tail * 6)
        p = tau * hz(midi) * t
        y = (np.sin(p + .8 * np.exp(-16*t) * np.sin(p*2)) + .17*np.sin(2*p))
        y *= gain * (1-np.exp(-190*t)) * np.exp(-t/tail)
        put(at, y, pan)
        put(at+.375, y*.19, -pan)
        put(at+.750, y*.065, pan)

    def tick(at, level, pan=0, wood=False):
        t = clock(.09 if wood else .055)
        white = rng.normal(0, .6, len(t))
        high = np.diff(white, prepend=white[0])
        tone = np.sin(tau*(710*t+1.6*(1-np.exp(-95*t)))) if wood else 0
        put(at, level*(high*.45*np.exp(-190*t) + tone*np.exp(-68*t))*(1-np.exp(-1200*t)), pan)

    # Suspended voicings leave space for the clicks; the final chord resolves to D.
    chords = [(50,57,60,64,65), (46,53,57,60,64), (48,55,59,62,64), (43,50,57,60,65)]
    for phrase in range(8):
        root, *upper = chords[phrase % 4] if phrase < 7 else (50,57,60,64,69)
        at = 4 * phrase
        t = clock(4.8)
        env = (1-np.exp(-2.8*(t+.005))) * np.exp(-2.9*np.maximum(t-3.6, 0))
        for i, midi in enumerate(upper):
            f = hz(midi)
            for side in [-1, 1]:
                p = tau * t * f * (1 + side*.0012)
                sig = np.sin(p + .21*np.sin(tau*.14*t+i)) + .18*np.sin(2*p)
                put(at, .054*env*sig, side*(.33+i*.12))
        for beat in range(8):
            event = at + .5*beat
            if phrase < 7 or beat < 3:
                # Soft, short kick with a pitched attack and a rounded sub pulse.
                kt = clock(.37)
                kick = np.sin(tau*(49*kt+1.66*(1-np.exp(-40*kt))))
                if beat in (0, 3, 4, 6):
                    put(event, .32*kick*np.exp(-14*kt)*(1-np.exp(-330*kt)))
                if beat % 2 == 1:
                    tick(event, .105, -.12, wood=True)
                tick(event+.25, .043 if beat%2 else .059, .34)
            if beat in (0, 3, 4, 6) and (phrase < 7 or beat < 3):
                bt=clock(.72); p=tau*hz(root-12)*bt
                put(event+.018,.16*(np.sin(p)+.22*np.sin(2*p))*(1-np.exp(-24*bt))*np.exp(-4.3*bt))
        notes = [upper[0]+12, upper[2]+12, upper[1]+12, upper[3]+12]
        for i, pos in enumerate((.25,1.00,2.75,3.25)):
            if phrase != 7 or i<2:
                pluck(at+pos, notes[i], (.083,.065,.085,.055)[i], (-.39,.26,-.12,.46)[i])

    # Foley on the chord, mouse down, PTY keys, return and caption click.
    for at in (cues['hero'], cues['open'], cues['reopen']):
        for i in range(3):
            tick(at+i*.034,.12+i*.015,-.18+i*.11,wood=True)
    for at in (cues['tile'], cues['enter'], cues['back'], cues['caption']):
        tick(at,.22,.1,wood=True); tick(at+.075,.075,.18)
    for i, at in enumerate(cues['typing']):
        tick(at,.071+.014*(i%3),-.25+.08*(i%4),wood=True)
    for at, midi in ((cues['open']+.20,81),(cues['verified'],76),(cues['verified']+.16,81),(27.96,74),(28.22,81)):
        pluck(at,midi,.083,.3,.48)
    mix *= np.minimum(1, clock(DURATION)/.06)[:,None]
    mix *= np.minimum(1, (DURATION-clock(DURATION))/1.45)[:,None]
    mix = .59 * mix / np.max(np.abs(mix))
    with wave.open(str(path),'wb') as out:
        out.setparams((2,2,RATE,0,'NONE','not compressed'))
        out.writeframes((mix*32767).astype('<i2').tobytes())
