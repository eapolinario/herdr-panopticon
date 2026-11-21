"""Rebuild the showcase and its linked README poster. See README.md in this directory."""
import argparse
import base64
import shutil
import subprocess
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

from score import DURATION, write_score

HERE = Path(__file__).resolve().parent
FPS = 30


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=HERE.parent / 'media')
    parser.add_argument('--browser', default=shutil.which('chromium') or shutil.which('google-chrome'))
    parser.add_argument('--still', type=float, metavar='SECONDS', help='export one full-resolution edit frame instead')
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp, sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=args.browser, args=['--disable-background-networking'])
        page = browser.new_page(viewport={'width':1920,'height':1080}, device_scale_factor=1)
        page.goto((HERE/'film.html').as_uri()+'?render')
        page.evaluate('window.ready')
        cdp = page.context.new_cdp_session(page)

        def frame(t, poster=False):
            page.evaluate('([t, poster]) => window.frame(t, poster)', [t, poster])
            png = cdp.send('Page.captureScreenshot', {'format':'png', 'optimizeForSpeed':True})
            return base64.b64decode(png['data'])

        if args.still is not None:
            (args.out / 'still.png').write_bytes(frame(args.still))
            return
        poster = Path(tmp)/'poster.jpg'
        subprocess.run(['ffmpeg','-v','error','-i','pipe:0','-vf','scale=1440:810:flags=lanczos',
                        '-frames:v','1','-q:v','2',str(poster)], input=frame(2.08, True), check=True)
        score = Path(tmp)/'score.wav'
        write_score(score, page.evaluate('window.cues'))
        movie = Path(tmp)/'panopticon.mp4'
        cmd = ['ffmpeg','-v','error','-f','image2pipe','-c:v','png','-framerate',str(FPS),'-i','pipe:0','-i',str(score),
               '-i',str(HERE/'walkthrough.vtt'),'-map','0:v','-map','1:a','-map','2:s','-vf','scale=out_color_matrix=bt709,format=yuv420p','-c:v','libx264',
               '-preset','slow','-crf','20','-maxrate','2150k','-bufsize','3500k','-profile:v','high','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',
               '-c:a','aac','-b:a','160k','-c:s','mov_text','-metadata:s:s:0','language=eng','-disposition:s:0','0','-movflags','+faststart','-metadata','title=Panopticon — Every agent. One grid.',str(movie)]
        with subprocess.Popen(cmd, stdin=subprocess.PIPE) as ff:
            try:
                for n in range(DURATION*FPS):
                    # Once the opaque end card settles, the remaining frames are identical.
                    if n <= round(28.45*FPS)+1:
                        png = frame(n/FPS)
                    ff.stdin.write(png)
                    if n%(FPS*4)==0: print(f'{n//FPS:2d} / {DURATION}s', flush=True)
            finally:
                ff.stdin.close()
            if ff.wait(): raise RuntimeError('FFmpeg failed')
        shutil.copyfile(movie,args.out/'panopticon.mp4')
        shutil.copyfile(poster,args.out/'panopticon-poster.jpg')


if __name__ == '__main__':
    main()
