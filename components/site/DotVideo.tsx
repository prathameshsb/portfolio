'use client';

import { useEffect, useRef } from 'react';

export function DotVideo() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext('2d');
    const sample = document.createElement('canvas'), sampling = sample.getContext('2d', { willReadFrequently: true });
    if (!context || !sampling) return;
    const video = document.createElement('video');
    video.src = '/assets/o0cdnMGuTWGvRk12xAF9EnlcqmI.mp4'; video.muted = true; video.loop = true; video.playsInline = true;
    let frame = 0, width = 1, height = 1;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function draw() {
      if (!element || !context || !sampling || !video.videoWidth) return;
      const ratio = devicePixelRatio || 1;
      element.width = sample.width = Math.round(width * ratio);
      element.height = sample.height = Math.round(height * ratio);
      context.scale(ratio, ratio); sampling.scale(ratio, ratio);
      const videoRatio = video.videoWidth / video.videoHeight;
      const drawWidth = videoRatio > width / height ? height * videoRatio : width;
      const drawHeight = videoRatio > width / height ? height : width / videoRatio;
      sampling.drawImage(video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
      const pixels = sampling.getImageData(0, 0, sample.width, sample.height).data;
      let size = 2, step = 4;
      const columns = Math.floor(width / step), rows = Math.floor(height / step);
      if (columns > 200 || rows > 200) { size = (columns >= rows ? width / 200 : height / 200) - 2; step = size + 2; }
      context.clearRect(0, 0, width, height);
      context.fillStyle = 'rgb(150,83,83)';
      for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) {
        const pixel = (Math.min(Math.round(y * ratio), sample.height - 1) * sample.width + Math.min(Math.round(x * ratio), sample.width - 1)) * 4;
        const luminance = .2126 * pixels[pixel] + .7152 * pixels[pixel + 1] + .0722 * pixels[pixel + 2];
        if (luminance <= .37 * 255) context.fillRect(x + 1, y + 1, size, size);
      }
      if (!reduced) frame = requestAnimationFrame(draw);
    }
    const observer = new ResizeObserver(() => {
      width = Math.max(4, Math.floor(element.clientWidth / 4) * 4); height = Math.max(4, Math.floor(element.clientHeight / 4) * 4);
      if (reduced && video.readyState >= 2) draw();
    });
    observer.observe(element);
    video.addEventListener('loadeddata', () => { draw(); if (reduced) video.pause(); });
    void video.play().catch(() => undefined);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); video.pause(); video.removeAttribute('src'); video.load(); };
  }, []);
  return <canvas ref={canvas} style={{ display: 'block', width: '100%', height: '100%', imageRendering: 'pixelated' }} aria-hidden="true" />;
}
