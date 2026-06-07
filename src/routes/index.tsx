import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PermissionGate } from "@/components/visualizer/PermissionGate";
import { VisualizerStage } from "@/components/visualizer/VisualizerStage";
import { ControlsDock, TopBadge } from "@/components/visualizer/ControlsDock";
import { MediaTray } from "@/components/visualizer/MediaTray";
import { VideoBackdrop } from "@/components/visualizer/VideoBackdrop";
import { StoryOverlay, type StorySnapshot } from "@/components/visualizer/StoryOverlay";
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
  const [vibeConfig, setVibeConfig] = useState<VibeConfig | null>(null);
  const [preset, setPreset] = useState<PresetId>("tunnel");
  const [sensitivity, setSensitivity] = useState(1.2);
  const [videoOn, setVideoOn] = useState(true);
  const [silhouetteOn, setSilhouetteOn] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [storyOpen, setStoryOpen] = useState(false);
  const [story, setStory] = useState<StorySnapshot | null>(null);
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

  if (!started) return <PermissionGate onReady={(vibe) => {
    setVibeConfig(vibe);
    if (vibe) setStory({ memory: vibe.narrativeSeed, timeline: [], vibeLabel: vibe.moodLabel });
    setStarted(true);
  }} />;

  return (
    <div
      className="relative h-[100dvh] w-screen overflow-hidden bg-black"
      onPointerDown={bump}
      onTouchStart={bump}
    >
      <VideoBackdrop enabled={videoOn} />
      <VisualizerStage
        preset={preset}
        vibeConfig={vibeConfig}
        silhouetteOn={silhouetteOn}
        onNarrative={(s) =>
          setStory({
            memory: s.memory,
            timeline: s.timeline,
            lastMood: s.lastMood,
            lastWord: s.lastWord,
            vibeLabel: vibeConfig?.moodLabel ?? null,
          })
        }
      />
      <TopBadge preset={preset} visible={uiVisible} moodLabel={vibeConfig?.moodLabel ?? null} />

      <button
        onClick={() => { setStoryOpen((v) => !v); bump(); }}
        className={`pointer-events-auto absolute right-4 top-[max(3rem,calc(env(safe-area-inset-top)+2.5rem))] z-20 rounded-full border px-3 py-1 text-[10px] font-bold tracking-widest backdrop-blur-md transition-opacity duration-300 ${
          storyOpen ? "border-white bg-white text-black" : "border-white/40 bg-black/40 text-white/80"
        } ${uiVisible ? "opacity-100" : "opacity-0"}`}
      >
        STORY
      </button>

      <StoryOverlay open={storyOpen} onClose={() => setStoryOpen(false)} snapshot={story} />

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
        silhouetteOn={silhouetteOn}
        setSilhouetteOn={(v) => {
          setSilhouetteOn(v);
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
