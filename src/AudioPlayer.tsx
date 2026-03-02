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
import ZoomPlugin from "wavesurfer.js/dist/plugins/zoom";
import {
  Box,
  CircularProgress,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import StopIcon from "@mui/icons-material/Stop";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { formatTime } from "./formatTime";
import { useStopwatch } from "./useStopwatch";
import { spliceAudio } from "./audioUtils";

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
  audioSource?: Blob;

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

  /** Show the "Replace (AI)" menu item (default: true) */
  showReplaceAI?: boolean;
  /** Called when the user clicks "Replace AI" in the menu */
  onReplaceAI?: () => void;

  /** Called when the drag-selection changes (null when cleared) */
  onSelectionChange?: (
    selection: { start: number; end: number } | null,
  ) => void;

  /** Show a Record button instead of Play when no audio is loaded (default: false) */
  showRecordButton?: boolean;
  /** Show a (disabled) cut icon in the controls row (default: false) */
  showCut?: boolean;
  /** Show a trash icon in the controls row (default: false) */
  showTrash?: boolean;

  /** Programmatically create a selection region on the waveform once audio is loaded */
  initialSelection?: { start: number; end: number };

  /** Called when the internal audio changes (e.g. recording completed, trash clicked) */
  onAudioChange?: (audio: Blob | null) => void;

  /** Enable mouse-wheel and touch-pinch zoom on the waveform (default: true) */
  enableZoom?: boolean;

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
      showReplaceAI = true,
      onReplaceAI,
      onSelectionChange,
      showRecordButton = false,
      showCut = false,
      showTrash = false,
      initialSelection,
      onRecordingComplete,
      onAudioChange,
      enableZoom = true,
      children,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WaveSurfer | null>(null);
    const regionsRef = useRef<RegionsPlugin | null>(null);
    const recordRef = useRef<RecordPlugin | null>(null);
    const recordedBlobRef = useRef<Blob | null>(null);
    const suppressDecodeRef = useRef(false);

    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [warmingUp, setWarmingUp] = useState(false);
    const [internalAudio, setInternalAudio] = useState<Blob | null>(
      audioSource ?? null,
    );
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
      if (audioSource) {
        setInternalAudio(audioSource);
      }
    }, [audioSource]);
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
    const onSelectionChangeRef = useRef(onSelectionChange);
    useEffect(() => {
      onSelectionChangeRef.current = onSelectionChange;
    }, [onSelectionChange]);
    const onAudioChangeRef = useRef(onAudioChange);
    useEffect(() => {
      onAudioChangeRef.current = onAudioChange;
    }, [onAudioChange]);
    const isRecordingRef = useRef(false);
    useEffect(() => {
      isRecordingRef.current = isRecording;
    }, [isRecording]);
    const warmingUpRef = useRef(false);
    useEffect(() => {
      warmingUpRef.current = warmingUp;
    }, [warmingUp]);

    // Fire onAudioChange whenever internalAudio changes (skip the initial render)
    const isFirstRenderRef = useRef(true);
    useEffect(() => {
      if (isFirstRenderRef.current) {
        isFirstRenderRef.current = false;
        return;
      }
      onAudioChangeRef.current?.(internalAudio);
    }, [internalAudio]);

    // Ref to track whether a region add is programmatic
    const programmaticRef = useRef(false);

    // Imperative handle
    useImperativeHandle(ref, () => ({
      setTime: (t: number) => wsRef.current?.setTime(t),
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
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

      const plugins: Array<RegionsPlugin | ZoomPlugin> = [wsRegions];
      if (enableZoom) {
        plugins.push(
          ZoomPlugin.create({
            scale: 0.5,
            maxZoom: 300,
            deltaThreshold: 5,
            exponentialZooming: true,
            iterations: 20,
          }),
        );
      }

      const ws = WaveSurfer.create({
        container: containerRef.current,
        waveColor,
        progressColor,
        cursorColor: "#333",
        cursorWidth: 4,
        barWidth: 2,
        height,
        normalize: true,
        plugins,
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
        setInternalAudio(blob);
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
        const sel = { start: region.start, end: region.end };
        setSelection(sel);
        onSelectionChangeRef.current?.(sel);
        ws.setTime(region.start);
      });

      wsRegions.on("region-updated", (region) => {
        if (region.start === region.end) return;
        const sel = { start: region.start, end: region.end };
        setSelection(sel);
        onSelectionChangeRef.current?.(sel);
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
        } else if (!initialSelection) {
          // Clear selection regions (but not when initialSelection is set)
          wsRegions.getRegions().forEach((r) => {
            if (r.start !== r.end) r.remove();
          });
          setSelection(null);
          onSelectionChangeRef.current?.(null);
        }
      });

      // --- Playback events ---
      ws.on("timeupdate", (time) => {
        setCurrentTime(time);
        onTimeUpdateRef.current?.(time);
        // Stop playback at selection end and seek back to start
        const sel = selectionRef.current;
        if (ws.isPlaying() && sel && sel.start !== sel.end && time >= sel.end) {
          ws.pause();
          ws.setTime(sel.start);
          setCurrentTime(sel.start);
          setPlaying(false);
        }
      });
      ws.on("decode", (d) => {
        if (suppressDecodeRef.current) {
          suppressDecodeRef.current = false;
          return;
        }
        // Ignore decode events during warmup/recording (scrolling waveform buffer)
        if (isRecordingRef.current || warmingUpRef.current) return;
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
      if (!ws || !internalAudio) return;
      // Restore cursor visibility (may have been hidden by trash)
      ws.setOptions({ cursorWidth: 4 });
      // Skip reload if this blob was just rendered by the RecordPlugin
      if (
        internalAudio instanceof Blob &&
        internalAudio === recordedBlobRef.current
      ) {
        recordedBlobRef.current = null;
        return;
      }
      const url = URL.createObjectURL(internalAudio);
      ws.load(url);
      return () => URL.revokeObjectURL(url);
    }, [internalAudio]);

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

    /* ----- Sync initial selection → RegionsPlugin ----- */
    useEffect(() => {
      const rp = regionsRef.current;
      if (!rp || !initialSelection || !duration) return;
      // Clear existing non-marker regions
      rp.getRegions().forEach((r) => {
        if (r.start !== r.end) r.remove();
      });
      programmaticRef.current = true;
      rp.addRegion({
        id: "initial-selection",
        start: initialSelection.start,
        end: initialSelection.end,
        color: "rgba(0, 0, 0, 0.1)",
      });
      programmaticRef.current = false;
      setSelection({
        start: initialSelection.start,
        end: initialSelection.end,
      });
      wsRef.current?.setTime(initialSelection.start);
    }, [initialSelection, duration]);

    // Drive `duration` from a stopwatch while recording
    useStopwatch(isRecording, (t) => setDuration(t));

    /* ----- Sync play state ----- */
    useEffect(() => {
      const ws = wsRef.current;
      if (!ws) return;
      playing ? ws.play() : ws.pause();
    }, [playing]);

    /* ----- Render ----- */
    const hasLoadedAudio = duration > 0;

    const handlePlayToggle = () => setPlaying((p) => !p);

    const handleStartRec = async () => {
      const rec = recordRef.current;
      if (!rec) return;
      try {
        setWarmingUp(true);
        await rec.startMic();
        await new Promise((r) => setTimeout(r, 1250));
        setWarmingUp(false);
        setIsRecording(true);
        await rec.startRecording();
      } catch {
        setWarmingUp(false);
        setIsRecording(false);
      }
    };
    const handleStopRec = () => {
      recordRef.current?.stopRecording();
      setIsRecording(false);
    };
    const handleCutClick = async () => {
      if (!internalAudio || !selection) return;
      const cutStart = selection.start;
      try {
        const spliced = await spliceAudio(
          internalAudio,
          selection.start,
          selection.end,
        );
        // Clear selection and regions before loading new audio
        setSelection(null);
        onSelectionChangeRef.current?.(null);
        regionsRef.current?.getRegions().forEach((r) => {
          if (r.start !== r.end) r.remove();
        });
        setInternalAudio(spliced);
        wsRef.current?.setTime(cutStart);
      } catch {
        // Splice failed — leave audio unchanged
      }
    };
    const handleTrashClick = () => {
      setInternalAudio(null);
      const ws = wsRef.current;
      if (ws) {
        suppressDecodeRef.current = true;
        ws.empty();
        ws.setOptions({ cursorWidth: 0 });
      }
      setDuration(0);
      setCurrentTime(0);
      setPlaying(false);
      setSelection(null);
    };

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

    const menuItems: React.ReactNode[] = [];
    if (showReplaceAI) {
      menuItems.push(
        <MenuItem key="replace-ai" onClick={handleReplaceAi}>
          <ListItemIcon>
            <GraphicEqIcon />
          </ListItemIcon>
          <ListItemText>Replace (AI)</ListItemText>
        </MenuItem>,
      );
    }
    const hasMenu = menuItems.length > 0;

    const timeText = formatTimeDisplay
      ? formatTimeDisplay(currentTime, duration)
      : selection
        ? `${formatTime(selection.start)} - ${formatTime(selection.end)} / ${formatTime(duration || 0)}`
        : `${formatTime(currentTime)} / ${formatTime(duration || 0)}`;

    return (
      <Box>
        <Stack direction="row" alignItems="center" spacing={2}>
          {/* Left button: Record/Stop when showRecordButton and no audio (or warming up / actively recording), otherwise Play/Pause */}
          {showRecordButton &&
          (!hasLoadedAudio || isRecording || warmingUp) ? (
            warmingUp ? (
              <IconButton disabled sx={{ p: 0 }} aria-label="warming up">
                <CircularProgress size={24} />
              </IconButton>
            ) : isRecording ? (
              <IconButton
                onClick={handleStopRec}
                sx={{ p: 0 }}
                aria-label="stop recording"
              >
                <StopIcon fontSize="large" sx={{ color: "error.main" }} />
              </IconButton>
            ) : (
              <IconButton
                onClick={handleStartRec}
                sx={{ p: 0 }}
                aria-label="start recording"
              >
                <FiberManualRecordIcon
                  fontSize="large"
                  sx={{ color: "error.main" }}
                />
              </IconButton>
            )
          ) : (
            <IconButton
              onClick={handlePlayToggle}
              disabled={!hasLoadedAudio}
              sx={{ p: 0 }}
              aria-label={playing ? "pause" : "play"}
            >
              {playing ? (
                <PauseIcon fontSize="large" sx={{ color: "neutral.main" }} />
              ) : (
                <PlayArrowIcon
                  fontSize="large"
                />
              )}
            </IconButton>
          )}
          <Typography variant="body2">{timeText}</Typography>
          <Box sx={{ flexGrow: 1 }} />
          {showCut && (
            <IconButton
              disabled={!selection}
              size="small"
              aria-label="cut"
              onClick={handleCutClick}
            >
              <ContentCutIcon fontSize="small" />
            </IconButton>
          )}
          {showTrash && (
            <IconButton
              disabled={!hasLoadedAudio || isRecording || warmingUp}
              size="small"
              aria-label="delete recording"
              onClick={handleTrashClick}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          )}
          {hasMenu && (
            <IconButton onClick={handleMenuOpen}>
              <MoreVertIcon />
            </IconButton>
          )}
        </Stack>

        {hasMenu && (
          <Menu
            anchorEl={menuAnchorEl}
            open={isMenuOpen}
            onClose={handleMenuClose}
          >
            {menuItems}
          </Menu>
        )}

        <Box
          ref={containerRef}
          aria-label="Waveform"
          sx={{
            minHeight: height,
            bgcolor: "action.hover",
            my: 1,
            borderRadius: 1,
            overflowX: "auto",
            overflowY: "hidden",
            width: "100%",
            touchAction: "none",
            "&::-webkit-scrollbar": {
              height: 12,
              WebkitAppearance: "none",
            },
            "&::-webkit-scrollbar-thumb": {
              borderRadius: 4,
              bgcolor: "rgba(0,0,0,0.3)",
            },
            "&::-webkit-scrollbar-track": {
              bgcolor: "rgba(0,0,0,0.1)",
            },
          }}
        />
        {children}
      </Box>
    );
  },
);

AudioPlayer.displayName = "AudioPlayer";
