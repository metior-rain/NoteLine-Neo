#!/usr/bin/env python3
"""Read-only audio analysis; writes compact features, timing candidates and original cover."""
import argparse
import json
import shutil
import subprocess
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('audio', type=Path)
    p.add_argument('--out-dir', required=True, type=Path)
    p.add_argument('--min-bpm', type=float, default=60)
    p.add_argument('--max-bpm', type=float, default=210)
    args = p.parse_args()
    try:
        import numpy as np
        from numpy.lib.stride_tricks import sliding_window_view
    except ImportError:
        p.error('NumPy is required; select an existing Python environment with NumPy.')
    if not (20 <= args.min_bpm < args.max_bpm <= 400):
        p.error('BPM search range must fit 20–400.')
    src = args.audio.resolve()
    if not src.is_file():
        p.error('Audio file does not exist.')
    if src.stat().st_size > 100_000_000:
        p.error('NoteLine audio limit is 100MB.')
    for tool in ['ffmpeg', 'ffprobe']:
        if not shutil.which(tool):
            p.error(tool + ' is required.')
    meta = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_entries',
        'format=duration:format_tags=title,artist:stream=index,codec_name,codec_type:stream_disposition=attached_pic',
        '-of', 'json', str(src)]))
    declared = float(meta.get('format', {}).get('duration', 0))
    if not 0 < declared <= 3601:
        p.error('Expected an audio file with a duration of at most one hour.')
    out = args.out_dir.resolve(); out.mkdir(parents=True, exist_ok=True)
    features = out / 'features.npz'; report = out / 'analysis.json'
    if features.exists() or report.exists():
        p.error('Analysis output already exists; select a new directory to preserve previous work.')
    # Full decode is needed for actual duration. Spectral processing is chunked.
    sr, hop, nfft = 22050, 220, 1024
    pcm = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(src),
        '-map', '0:a:0', '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'])
    y = np.frombuffer(pcm, dtype='<f4')
    duration = len(y) / sr
    if len(y) < nfft or duration > 3600:
        p.error('Decoded audio is too short or exceeds one hour.')
    frames = sliding_window_view(y, nfft)[::hop]
    freq = np.fft.rfftfreq(nfft, 1 / sr)
    masks = [(freq >= lo) & (freq < hi) for lo, hi in
        [(30, 180), (180, 700), (700, 2500), (2500, 10000)]]
    window = np.hanning(nfft)
    bands = np.empty((len(frames), 4), dtype=np.float32)
    for start in range(0, len(frames), 2048):
        spectrum = abs(np.fft.rfft(frames[start:start + 2048] * window, axis=1))
        for j, mask in enumerate(masks):
            bands[start:start + len(spectrum), j] = np.log1p(spectrum[:, mask].sum(axis=1))
    flux = np.maximum(0, np.diff(bands, axis=0, prepend=bands[:1]))
    flux /= np.maximum(np.percentile(flux, 95, axis=0), .01)
    onset = flux @ np.array([.4, .2, .25, .15])
    times = (np.arange(len(onset)) * hop + nfft / 2) / sr
    peaks = np.flatnonzero((onset[1:-1] > onset[:-2]) &
        (onset[1:-1] >= onset[2:]) & (onset[1:-1] > .5)) + 1
    # Limit long-track phase fitting cost while sampling the entire recording.
    fit = peaks[::max(1, int(np.ceil(len(peaks) / 4000)))]
    ts, weights = times[fit], np.minimum(onset[fit], 3)
    bpms = np.arange(args.min_bpm, args.max_bpm + .001, .01)
    scores = np.zeros(len(bpms))
    if weights.sum() > 0:
        for i, bpm in enumerate(bpms):
            period = 30 / bpm  # eighth-note lattice; does not identify downbeat
            scores[i] = abs(np.sum(weights * np.exp(2j * np.pi * ts / period))) / weights.sum()
    candidates = [i for i in range(1, len(scores) - 1)
        if scores[i] > scores[i - 1] and scores[i] > scores[i + 1]]
    if scores.max() > 0:
        candidates.append(int(np.argmax(scores)))
    ranked = sorted(set(candidates), key=lambda i: -scores[i])[:8]
    tempos = []
    for i in ranked:
        bpm = float(bpms[i]); period = 30 / bpm
        phase = float(np.angle(np.sum(weights * np.exp(2j * np.pi * ts / period))) * period / (2 * np.pi) % period)
        local = []
        for start in range(0, int(duration), 16):
            mask = (ts >= start) & (ts < start + 16)
            w, x = weights[mask], ts[mask]
            if w.sum() <= 0:
                continue
            value = np.sum(w * np.exp(2j * np.pi * x / period))
            local.append({'start_s': start, 'phase_ms': round(float(np.angle(value) * period / (2 * np.pi) % period) * 1000, 3),
                'concentration': round(float(abs(value) / w.sum()), 4)})
        tempos.append({'bpm': round(bpm, 2), 'eighth_phase_ms': round(phase * 1000, 3),
            'concentration': round(float(scores[i]), 4), 'local_phase': local})
    blocks = []
    for start in range(0, int(np.ceil(duration)), 4):
        part = y[start * sr:min(len(y), (start + 4) * sr)]
        mask = (times >= start) & (times < start + 4)
        blocks.append({'start_s': start, 'end_s': min(start + 4, round(duration, 6)),
            'rms': round(float(np.sqrt(np.mean(part * part))), 5),
            'onset_mean': round(float(np.mean(onset[mask])), 4) if mask.any() else 0})
    out = args.out_dir.resolve(); out.mkdir(parents=True, exist_ok=True)
    cover = None
    for stream in meta.get('streams', []):
        if not stream.get('disposition', {}).get('attached_pic'):
            continue
        ext = {'png': '.png', 'mjpeg': '.jpg', 'webp': '.webp'}.get(stream.get('codec_name'))
        if ext:
            dest = out / ('cover' + ext)
            if dest.exists():
                p.error('Cover output already exists; select a new analysis directory.')
            subprocess.run(['ffmpeg', '-v', 'error', '-n', '-i', str(src), '-map',
                '0:' + str(stream['index']), '-c', 'copy', '-frames:v', '1', str(dest)], check=True)
            cover = str(dest)
        break
    features = out / 'features.npz'; report = out / 'analysis.json'
    if features.exists() or report.exists():
        p.error('Analysis output already exists; select a new directory to preserve previous work.')
    np.savez_compressed(features, times=times, onset=onset, band_flux=flux, bands=bands)
    tags = meta.get('format', {}).get('tags', {})
    result = {'audio': str(src), 'title': tags.get('title', src.stem), 'artist': tags.get('artist', ''),
        'duration_ms': round(duration * 1000, 3), 'sample_rate': sr,
        'tempo_candidates': tempos, 'energy_blocks': blocks, 'cover_file': cover,
        'features_file': str(features),
        'phase_warning': 'Eighth-note phase is not the first beat or bar; confirm downbeat and pickup separately.'}
    report.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'report': str(report), 'duration_ms': result['duration_ms'],
        'tempo_candidates': [{k: v for k, v in x.items() if k != 'local_phase'} for x in tempos],
        'cover_file': cover}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
