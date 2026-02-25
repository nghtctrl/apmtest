import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions";
import RecordPlugin from "wavesurfer.js/dist/plugins/record";
import {
  Box,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { formatTime } from "./formatTime";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** A point-in-time marker on the waveform */
export interface AudioMarker {
  time: number;
  color?: string;
}

export interface AudioPlayerHandle {
  /** Seek to a specific time */
  setTime: (time: number) => void;
  /** The waveform container element (for pixel calculations) */
  container: HTMLDivElement | null;
  /** Start recording from the microphone */
  startRecording: () => Promise<void>;
  /** Stop the active recording */
  stopRecording: () => void;
}

export interface AudioPlayerProps {
  /** Audio source — either a Blob or a URL string */
  audioSource?: Blob | string;

  /** Point markers rendered on the waveform (reconciled on change) */
  markers?: AudioMarker[];
  /** Allow user to drag-create a selection on the waveform */
  enableDragSelection?: boolean;
  /** Fired when a marker is clicked (receives the marker's time) */
  onMarkerClick?: (time: number) => void;

  /** WaveSurfer waveColor (default: '#9fc5e8') */
  waveColor?: string;
  /** WaveSurfer progressColor (default: '#9fc5e8') */
  progressColor?: string;
  /** Waveform height in px (default: 80) */
  height?: number;

  /** Custom time display. If omitted, shows "currentTime / duration" (or selection range when active) */
  formatTimeDisplay?: (currentTime: number, duration: number) => string;
  /** Called on every timeupdate */
  onTimeUpdate?: (time: number) => void;
  /** Called when WaveSurfer decodes audio (provides duration) */
  onReady?: (duration: number) => void;
  /** Called when a recording completes (provides the recorded Blob) */
  onRecordingComplete?: (blob: Blob) => void;

  /** Called when the user clicks "Replace AI" in the menu */
  onReplaceAI?: () => void;

  /** Children rendered below the waveform (e.g. helper text) */
  children?: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(
  (
    {
      audioSource,
      markers,
      enableDragSelection = false,
      onMarkerClick,
      waveColor = "#9fc5e8",
      progressColor = "#9fc5e8",
      height = 80,
      formatTimeDisplay,
      onTimeUpdate,
      onReady,
      onReplaceAI,
      onRecordingComplete,
      children,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WaveSurfer | null>(null);
    const regionsRef = useRef<RegionsPlugin | null>(null);
    const recordRef = useRef<RecordPlugin | null>(null);
    const recordedBlobRef = useRef<Blob | null>(null);

    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);

    // Internal selection state (managed when enableDragSelection is true)
    const [selection, setSelection] = useState<{
      start: number;
      end: number;
    } | null>(null);
    const selectionRef = useRef(selection);
    useEffect(() => {
      selectionRef.current = selection;
    }, [selection]);

    // Stable callback refs so WaveSurfer listeners never go stale
    const onMarkerClickRef = useRef(onMarkerClick);
    const onTimeUpdateRef = useRef(onTimeUpdate);
    const onReadyRef = useRef(onReady);
    useEffect(() => {
      onMarkerClickRef.current = onMarkerClick;
    }, [onMarkerClick]);
    useEffect(() => {
      onTimeUpdateRef.current = onTimeUpdate;
    }, [onTimeUpdate]);
    useEffect(() => {
      onReadyRef.current = onReady;
    }, [onReady]);
    const onRecordingCompleteRef = useRef(onRecordingComplete);
    useEffect(() => {
      onRecordingCompleteRef.current = onRecordingComplete;
    }, [onRecordingComplete]);

    // Ref to track whether a region add is programmatic
    const programmaticRef = useRef(false);

    // Imperative handle
    useImperativeHandle(ref, () => ({
      setTime: (t: number) => wsRef.current?.setTime(t),
      get container() {
        return containerRef.current;
      },
      startRecording: async () => {
        const rec = recordRef.current;
        if (!rec) return;
        // Warm up the mic stream first so the audio pipeline is stable
        await rec.startMic();
        await new Promise((r) => setTimeout(r, 1250));
        await rec.startRecording();
      },
      stopRecording: () => {
        recordRef.current?.stopRecording();
      },
    }));

    /* ----- Init WaveSurfer ----- */
    useEffect(() => {
      if (!containerRef.current) return;

      const wsRegions = RegionsPlugin.create();
      regionsRef.current = wsRegions;

      const ws = WaveSurfer.create({
        container: containerRef.current,
        waveColor,
        progressColor,
        cursorColor: "#333",
        cursorWidth: 4,
        barWidth: 2,
        height,
        normalize: true,
        plugins: [wsRegions],
      });
      wsRef.current = ws;

      const record = ws.registerPlugin(
        RecordPlugin.create({
          scrollingWaveform: true,
          renderRecordedAudio: true,
        }),
      );
      recordRef.current = record;

      record.on("record-end", (blob: Blob) => {
        recordedBlobRef.current = blob;
        onRecordingCompleteRef.current?.(blob);
      });

      if (enableDragSelection) {
        wsRegions.enableDragSelection({ color: "rgba(0, 0, 0, 0.1)" });
      }

      // --- Region events (drag-selection) ---
      wsRegions.on("region-created", (region) => {
        if (region.start === region.end) return; // marker, ignore
        if (programmaticRef.current) return;

        // Remove other non-marker regions (single-selection mode)
        wsRegions.getRegions().forEach((r) => {
          if (r.id !== region.id && r.start !== r.end) r.remove();
        });
        setSelection({ start: region.start, end: region.end });
        ws.setTime(region.start);
      });

      wsRegions.on("region-updated", (region) => {
        if (region.start === region.end) return;
        setSelection({ start: region.start, end: region.end });
        ws.setTime(region.start);
      });

      wsRegions.on("region-clicked", (region, e) => {
        if (region.start !== region.end) {
          e.stopPropagation();
        }
      });

      // --- Waveform click ---
      ws.on("click", (relativeX) => {
        const waveformWidth = containerRef.current?.clientWidth || 1;
        const audioDuration = ws.getDuration() || 1;
        const clickTime = relativeX * audioDuration;
        const TOLERANCE_PX = 4;
        const toleranceSec = (TOLERANCE_PX / waveformWidth) * audioDuration;

        // Check if click is near a marker
        const clickedMarker = wsRegions
          .getRegions()
          .find(
            (r) =>
              r.start === r.end &&
              Math.abs(clickTime - r.start) <= toleranceSec,
          );
        if (clickedMarker) {
          onMarkerClickRef.current?.(clickedMarker.start);
        } else {
          // Clear selection regions
          wsRegions.getRegions().forEach((r) => {
            if (r.start !== r.end) r.remove();
          });
          setSelection(null);
        }
      });

      // --- Playback events ---
      ws.on("timeupdate", (time) => {
        setCurrentTime(time);
        onTimeUpdateRef.current?.(time);
        // Stop playback at selection end
        const sel = selectionRef.current;
        if (sel && sel.start !== sel.end && time >= sel.end) {
          ws.pause();
          setPlaying(false);
        }
      });
      ws.on("decode", (d) => {
        setDuration(d);
        onReadyRef.current?.(d);
      });
      ws.on("finish", () => setPlaying(false));

      return () => {
        ws.destroy();
        wsRef.current = null;
        regionsRef.current = null;
        recordRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* ----- Sync audio source ----- */
    useEffect(() => {
      const ws = wsRef.current;
      if (!ws || !audioSource) return;
      // Skip reload if this blob was just rendered by the RecordPlugin
      if (
        audioSource instanceof Blob &&
        audioSource === recordedBlobRef.current
      ) {
        recordedBlobRef.current = null;
        return;
      }
      if (typeof audioSource === "string") {
        ws.load(audioSource);
      } else {
        const url = URL.createObjectURL(audioSource);
        ws.load(url);
        return () => URL.revokeObjectURL(url);
      }
      return undefined;
    }, [audioSource]);

    /* ----- Sync markers prop → RegionsPlugin ----- */
    useEffect(() => {
      const rp = regionsRef.current;
      if (!rp) return;
      // Remove old markers
      rp.getRegions().forEach((r) => {
        if (r.start === r.end) r.remove();
      });
      // Add new markers
      (markers ?? []).forEach((m, i) => {
        rp.addRegion({
          id: `marker-${i}`,
          start: m.time,
          end: m.time,
          color: m.color ?? "rgba(0, 0, 0, 0.5)",
          drag: false,
          resize: false,
        });
      });
    }, [markers, duration]); // depend on duration so markers re-render after audio loads

    /* ----- Sync play state ----- */
    useEffect(() => {
      const ws = wsRef.current;
      if (!ws) return;
      playing ? ws.play() : ws.pause();
    }, [playing]);

    /* ----- Render ----- */
    const handlePlayToggle = () => setPlaying((p) => !p);
    const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
      setMenuAnchorEl(event.currentTarget);
    };
    const handleMenuClose = () => {
      setMenuAnchorEl(null);
    };
    const handleReplaceAi = () => {
      handleMenuClose();
      onReplaceAI?.();
    };
    const isMenuOpen = Boolean(menuAnchorEl);

    const timeText = formatTimeDisplay
      ? formatTimeDisplay(currentTime, duration)
      : selection
        ? `${formatTime(selection.start)} - ${formatTime(selection.end)} / ${formatTime(duration || 0)}`
        : `${formatTime(currentTime)} / ${formatTime(duration || 0)}`;

    return (
      <Box>
        <Stack direction="row" alignItems="center" spacing={2}>
          <IconButton
            onClick={handlePlayToggle}
            sx={{ p: 0 }}
            aria-label={playing ? "pause" : "play"}
          >
            {playing ? (
              <PauseIcon fontSize="large" sx={{ color: "neutral.main" }} />
            ) : (
              <PlayArrowIcon fontSize="large" sx={{ color: "neutral.main" }} />
            )}
          </IconButton>
          <Typography variant="body2">{timeText}</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <IconButton onClick={handleMenuOpen}>
            <MoreVertIcon />
          </IconButton>
        </Stack>

        <Menu
          anchorEl={menuAnchorEl}
          open={isMenuOpen}
          onClose={handleMenuClose}
        >
          <MenuItem onClick={handleReplaceAi}>Replace AI</MenuItem>
        </Menu>

        <Box
          ref={containerRef}
          aria-label="Waveform"
          sx={{
            height,
            bgcolor: "action.hover",
            my: 1,
            borderRadius: 1,
            overflow: "hidden",
            width: "100%",
          }}
        />
        {children}
      </Box>
    );
  },
);

AudioPlayer.displayName = "AudioPlayer";
