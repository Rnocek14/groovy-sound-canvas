import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PermissionGate } from "@/components/visualizer/PermissionGate";
import { VisualizerStage } from "@/components/visualizer/VisualizerStage";
import { ControlsDock, TopBadge } from "@/components/visualizer/ControlsDock";
import { MediaTray } from "@/components/visualizer/MediaTray";
import { VideoBackdrop } from "@/components/visualizer/VideoBackdrop";
import { audioEngine } from "@/lib/audio/AudioEngine";
import { CameraSource } from "@/components/visualizer/media/CameraSource";
import type { PresetId } from "@/components/visualizer/presets/types";
import type { VibeConfig } from "@/lib/vibe/types";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "WAVE.FM — Mic-Reactive Visualizer" },
      {
        name: "description",
        content:
          "Play music near your phone and watch tunnels, plasma, glitches and liquid chrome react in real time.",
      },
    ],
  }),
});

function Index() {
  const [started, setStarted] = useState(false);
  const [preset, setPreset] = useState<PresetId>("tunnel");
  const [sensitivity, setSensitivity] = useState(1.2);
  const [videoOn, setVideoOn] = useState(true);
  const [uiVisible, setUiVisible] = useState(true);
  const hideTimer = useRef<number | null>(null);

  const bump = () => {
    setUiVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setUiVisible(false), 3500);
  };

  useEffect(() => {
    if (!started) return;
    bump();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [started]);

  useEffect(() => {
    return () => {
      audioEngine.stop();
      CameraSource.stop();
    };
  }, []);

  if (!started) return <PermissionGate onReady={() => setStarted(true)} />;

  return (
    <div
      className="relative h-[100dvh] w-screen overflow-hidden bg-black"
      onPointerDown={bump}
      onTouchStart={bump}
    >
      <VideoBackdrop enabled={videoOn} />
      <VisualizerStage preset={preset} />
      <TopBadge preset={preset} visible={uiVisible} />
      <MediaTray visible={uiVisible} />
      <ControlsDock
        preset={preset}
        setPreset={(p) => {
          setPreset(p);
          bump();
        }}
        sensitivity={sensitivity}
        setSensitivity={(n) => {
          setSensitivity(n);
          bump();
        }}
        videoOn={videoOn}
        setVideoOn={(v) => {
          setVideoOn(v);
          bump();
        }}
        onExit={() => {
          audioEngine.stop();
          CameraSource.stop();
          setStarted(false);
        }}
        visible={uiVisible}
      />
    </div>
  );
}
