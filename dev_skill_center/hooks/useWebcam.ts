"use client";

import * as React from "react";

export type WebcamStatus = "idle" | "starting" | "live" | "denied" | "error";

export interface WebcamController {
  /** attach to <video ref={setVideo}> */
  setVideo: (el: HTMLVideoElement | null) => void;
  status: WebcamStatus;
  start: () => Promise<void>;
  stop: () => void;
  /** capture current frame as JPEG base64 (no data: prefix) */
  capture: (quality?: number) => string | null;
}

/**
 * Live webcam for staff face enrolment / attendance verification.
 * NEVER stores images — capture returns a transient base64 string for the
 * caller to POST and discard. Tracks are stopped on stop()/unmount.
 */
export function useWebcam(): WebcamController {
  const videoEl = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [status, setStatus] = React.useState<WebcamStatus>("idle");

  const setVideo = React.useCallback((el: HTMLVideoElement | null) => {
    videoEl.current = el;
    if (el && streamRef.current && !el.srcObject) {
      el.srcObject = streamRef.current;
      el.play().catch(() => {});
    }
  }, []);

  const stop = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoEl.current) videoEl.current.srcObject = null;
  }, []);

  const start = React.useCallback(async () => {
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoEl.current) {
        videoEl.current.srcObject = stream;
        await videoEl.current.play().catch(() => {});
      }
      setStatus("live");
    } catch {
      setStatus("denied");
    }
  }, []);

  const capture = React.useCallback((quality = 0.8) => {
    const video = videoEl.current;
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl.split(",")[1] ?? null;
  }, []);

  React.useEffect(() => stop, [stop]);

  return { setVideo, status, start, stop, capture };
}
