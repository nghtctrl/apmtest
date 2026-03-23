import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Menu,
  Stack,
  Typography,
} from "@mui/material";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import CloudDoneOutlinedIcon from "@mui/icons-material/CloudDoneOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useAuth } from "./AuthContext";
import {
  fetchAudio,
  fetchReplacementAudio,
  getReplacements,
  saveReplacement,
  deleteReplacement,
} from "./api";
import { AudioPlayer, type AudioPlayerHandle } from "./AudioPlayer";
import AddReplacementDialog from "./AddReplacementDialog";
import PageHeader from "./PageHeader";
import { formatTime } from "./formatTime";
import { replaceAudioSegment, compressToMp3 } from "./audioUtils";

interface ReplaceAIPageState {
  passageId: number;
  passageReference: string;
  projectName: string;
  speaker?: string | null;
  sectionPassages?: { id: number; reference: string; speaker: string | null }[];
}

interface Replacement {
  id: number;
  title: string;
  note: string;
  selection: { start: number; end: number };
  audio: Blob;
}

interface OffsetEntry {
  composedStart: number;
  composedEnd: number;
  offset: number;
}

/** Map a time in composed-audio space back to original-passage time. */
function composedToOriginalTime(t: number, offsetMap: OffsetEntry[]): number {
  let prevOffset = 0;
  for (const entry of offsetMap) {
    if (t < entry.composedStart) return t - prevOffset;
    if (t <= entry.composedEnd) return entry.composedStart - prevOffset;
    prevOffset = entry.offset;
  }
  return t - prevOffset;
}

/** Map a time in original-passage space to composed-audio time. */
function originalToComposedTime(t: number, offsetMap: OffsetEntry[]): number {
  let prevOffset = 0;
  for (const entry of offsetMap) {
    const originalStart = entry.composedStart - prevOffset;
    if (t <= originalStart) return t + prevOffset;
    prevOffset = entry.offset;
  }
  return t + prevOffset;
}

export default function ReplaceAIPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();
  const state = (location.state ?? {}) as ReplaceAIPageState;

  const passageId = state.passageId ?? 0;
  const projectName = state.projectName ?? "";

  const playerRef = useRef<AudioPlayerHandle>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [selection, setSelection] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [replacements, setReplacements] = useState<Replacement[]>([]);
  const [saving, setSaving] = useState(false);

  const [composedAudio, setComposedAudio] = useState<Blob | null>(null);
  const [highlights, setHighlights] = useState<
    { start: number; end: number; color: string }[]
  >([]);
  const offsetMapRef = useRef<OffsetEntry[]>([]);

  // Load passage audio and existing replacements on mount
  useEffect(() => {
    if (!token || !passageId) return;
    fetchAudio(token, passageId).then((blob) => {
      if (blob) setAudioBlob(blob);
    });
    getReplacements(token, passageId).then(
      async ({ replacements: repData }) => {
        const withAudio = await Promise.all(
          repData.map(async (r) => {
            const audio = await fetchReplacementAudio(token, r.id);
            if (!audio) return undefined;
            return {
              id: r.id,
              title: r.title,
              note: r.note,
              selection: { start: r.selectionStart, end: r.selectionEnd },
              audio: audio,
            };
          }),
        );
        setReplacements(withAudio.filter((r) => r !== undefined));
      },
    );
  }, [token, passageId]);

  // Compose all replacement clips into the passage audio
  useEffect(() => {
    if (!audioBlob || replacements.length === 0) {
      setComposedAudio(null);
      setHighlights([]);
      offsetMapRef.current = [];
      return;
    }

    let cancelled = false;

    (async () => {
      const sorted = [...replacements].sort(
        (a, b) => a.selection.start - b.selection.start,
      );

      let current = audioBlob;
      let offset = 0;
      const newHighlights: { start: number; end: number; color: string }[] = [];
      const newOffsetMap: OffsetEntry[] = [];

      for (const r of sorted) {
        const adjustedStart = r.selection.start + offset;
        const adjustedEnd = r.selection.end + offset;
        const { blob, replacementDuration } = await replaceAudioSegment(
          current,
          adjustedStart,
          adjustedEnd,
          r.audio,
        );
        current = blob;
        const replacedDuration = r.selection.end - r.selection.start;
        offset += replacementDuration - replacedDuration;

        newHighlights.push({
          start: adjustedStart,
          end: adjustedStart + replacementDuration,
          color: "#ff660091",
        });
        newOffsetMap.push({
          composedStart: adjustedStart,
          composedEnd: adjustedStart + replacementDuration,
          offset,
        });
      }

      if (!cancelled) {
        setComposedAudio(current);
        setHighlights(newHighlights);
        offsetMapRef.current = newOffsetMap;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [audioBlob, replacements]);

  const handleBack = () => navigate("/dashboard");

  const handleExit = () => {
    navigate("/record", { state });
  };

  const handleAddReplacement = async (data: {
    title: string;
    note: string;
    selection: { start: number; end: number };
    replacementDuration: number;
    audio: Blob;
  }) => {
    setSaving(true);
    try {
      const originalSelection = {
        start: composedToOriginalTime(
          data.selection.start,
          offsetMapRef.current,
        ),
        end: composedToOriginalTime(data.selection.end, offsetMapRef.current),
      };

      const mp3Blob = await compressToMp3(
        new File([data.audio], "replacement.webm", { type: data.audio.type }),
        64,
      );

      const { replacement } = await saveReplacement(
        token!,
        passageId,
        data.title,
        data.note,
        originalSelection.start,
        originalSelection.end,
        mp3Blob,
      );

      setReplacements((prev) => [
        ...prev,
        {
          id: replacement.id,
          title: data.title,
          note: data.note,
          selection: originalSelection,
          audio: mp3Blob,
        },
      ]);
      setAddDialogOpen(false);
      playerRef.current?.updateSelection({
        start: data.selection.start,
        end: data.selection.start + data.replacementDuration,
      });
    } catch {
      // save failed — dialog stays open
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteReplacement = async (index: number) => {
    const r = replacements[index];
    setSaving(true);
    try {
      await deleteReplacement(token!, r.id);
      setReplacements((prev) => prev.filter((_, j) => j !== index));
    } catch {
      // deletion failed — leave list unchanged
    } finally {
      setSaving(false);
    }
  };

  const isSelectionStartingOverReplacement: () => boolean = () => {
    if (!selection) return false;
    const ret = replacements.some(
      (r) => Math.abs(r.selection.start - selection.start) < 0.5,
    );
    return ret;
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
      }}
    >
      {/* ─── Header ───────────────────────────────────────────── */}
      <PageHeader title={projectName} onBack={handleBack}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            bgcolor: "#9fc5e8",
            px: 1.5,
            py: 1,
            gap: 1,
          }}
        >
          <GraphicEqIcon />
          <Typography sx={{ fontWeight: 600 }}>Replace (AI)</Typography>

          <Box
            sx={{ display: "flex", alignItems: "center", ml: "auto", gap: 1 }}
          >
            {saving ? (
              <CircularProgress size={16} />
            ) : (
              <CloudDoneOutlinedIcon fontSize="small" />
            )}
            <Typography variant="body2">
              {saving ? "Saving…" : "Saved"}
            </Typography>
          </Box>

          <Button
            size="small"
            onClick={handleExit}
            sx={{
              ml: 1,
              border: "1px solid rgba(0,0,0,0.23)",
            }}
          >
            Exit
          </Button>

          <IconButton
            size="small"
            onClick={(e) => setMenuAnchorEl(e.currentTarget)}
          >
            <MoreVertIcon />
          </IconButton>
          <Menu
            anchorEl={menuAnchorEl}
            open={Boolean(menuAnchorEl)}
            onClose={() => setMenuAnchorEl(null)}
          >
            {/* Future menu items */}
          </Menu>
        </Box>
      </PageHeader>

      {/* ─── Main Content ─────────────────────────────────────── */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
          px: 2,
          pt: 2,
        }}
      >
        {/* Audio player */}
        <AudioPlayer
          ref={playerRef}
          audioSource={composedAudio ?? audioBlob ?? undefined}
          height={80}
          enableDragSelection
          showReplaceAI={false}
          onSelectionChange={setSelection}
          highlights={highlights}
        />

        {/* Selection range display + Add Replacement button */}
        {selection && !isSelectionStartingOverReplacement() && (
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2">
              {formatTime(selection.start)} - {formatTime(selection.end)}
            </Typography>
            <Box sx={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
              <Button
                variant={replacements.length === 0 ? "primary" : undefined}
                sx={{ width: "100%", maxWidth: 500 }}
                onClick={() => setAddDialogOpen(true)}
              >
                <AddIcon />
                Add Replacement
              </Button>
            </Box>
          </Stack>
        )}

        {/* Replacement rows */}
        {replacements.map((r, i) => (
          <Stack
            key={r.id}
            direction="row"
            alignItems="center"
            spacing={2}
            sx={{ mt: 1 }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {r.title}
            </Typography>
            <Typography variant="body2">
              {formatTime(
                originalToComposedTime(r.selection.start, offsetMapRef.current),
              )}{" "}
              -{" "}
              {formatTime(
                originalToComposedTime(r.selection.end, offsetMapRef.current),
              )}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <IconButton
              size="small"
              onClick={() => handleDeleteReplacement(i)}
              disabled={saving}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))}

        {/* Spacer */}
        <Box sx={{ flex: 1 }} />

        {/* Helper text */}
        {!selection && replacements.length === 0 && (
          <Typography variant="body1" sx={{ textAlign: "center", my: 24 }}>
            Drag to mark the parts you want to replace
          </Typography>
        )}
      </Box>

      <Box sx={{ px: 2, pb: 3 }}>
        <Button
          fullWidth
          variant="primary"
          disabled={replacements.length === 0}
        >
          Render Replacements
        </Button>
      </Box>

      {/* ─── Add Replacement Dialog ───────────────────────── */}
      {selection && (
        <AddReplacementDialog
          open={addDialogOpen}
          originalComposedAudio={composedAudio ?? audioBlob ?? undefined}
          selection={selection}
          existingHighlights={highlights}
          onCancel={() => setAddDialogOpen(false)}
          onContinue={handleAddReplacement}
        />
      )}
    </Box>
  );
}
