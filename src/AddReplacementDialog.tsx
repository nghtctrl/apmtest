import { useEffect, useRef, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";

import { AudioPlayer, type AudioPlayerHandle } from "./AudioPlayer";
import {
  mapPreviewTimeToOriginalTime,
  replaceAudioSegment,
} from "./audioUtils";

interface AddReplacementDialogProps {
  open: boolean;
  /** The original passage audio */
  audioSource?: Blob;
  /** The selection range from the parent ReplaceAIPage */
  selection: { start: number; end: number };
  /** Highlight regions from existing replacements */
  existingHighlights?: { start: number; end: number; color: string }[];
  onCancel: () => void;
  onContinue: (data: {
    title: string;
    note: string;
    selection: { start: number; end: number };
    replacementDuration: number;
    audio: Blob;
  }) => void;
}

export default function AddReplacementDialog({
  open,
  audioSource: originalAudio,
  selection,
  existingHighlights = [],
  onCancel,
  onContinue,
}: AddReplacementDialogProps) {
  const passagePlayerRef = useRef<AudioPlayerHandle>(null);
  const replacementPlayerRef = useRef<AudioPlayerHandle>(null);

  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [replacementAudio, setReplacementAudio] = useState<Blob | null>(null);
  const [appliedReplacementAudio, setAppliedReplacementAudio] =
    useState<Blob | null>(null);
  const [previewAudio, setPreviewAudio] = useState<Blob | undefined>(
    originalAudio,
  );
  const [stickySelection, setStickySelection] = useState(selection);
  const [hasSetReplacement, setHasEverSetReplacement] = useState(false);
  const [replacing, setReplacing] = useState(false);

  // Tracks where the replacement ends in the *original* audio's timeline.
  // Needed because after a replacement the preview waveform has a different
  // duration than the original, so dragged selection coordinates must be mapped
  // back to original-time before calling replaceAudioSegment.
  // You only need to track the end, since the start can simply be the preview start.
  const [originalSegmentEnd, setOriginalSegmentEnd] = useState<number | null>(
    null,
  );

  // Reset form state when dialog opens
  useEffect(() => {
    if (open) {
      setTitle("");
      setNote("");
      setName("");
      setReplacementAudio(null);
      setAppliedReplacementAudio(null);
      setPreviewAudio(originalAudio);
      setStickySelection(selection);
      setHasEverSetReplacement(false);
      setReplacing(false);
      setOriginalSegmentEnd(null);
    }
  }, [open]);

  const handleSetAsReplacement = async () => {
    if (!replacementAudio || !originalAudio) return;

    setHasEverSetReplacement(true);
    setReplacing(true);
    try {
      passagePlayerRef.current?.pushUndo();

      // stickySelection.start is always in original-time (audio with no replacement).
      // For .end, use the tracked original
      // end if a replacement was already applied, otherwise the selection end.
      const startInOriginal = stickySelection.start;
      const endInOriginal = originalSegmentEnd ?? stickySelection.end;

      const { blob, replacementDuration } = await replaceAudioSegment(
        originalAudio,
        startInOriginal,
        endInOriginal,
        replacementAudio,
      );
      setPreviewAudio(blob);
      setStickySelection({
        start: startInOriginal,
        end: startInOriginal + replacementDuration,
      });
      setOriginalSegmentEnd(endInOriginal);
      setAppliedReplacementAudio(replacementAudio);
    } catch {
      // Replacement failed — leave audio unchanged
    } finally {
      setReplacing(false);
    }
  };

  const handleContinue = () => {
    onContinue({
      title: title.trim(),
      note: note.trim(),
      selection: {
        start: stickySelection.start,
        end: originalSegmentEnd ?? stickySelection.end,
      },
      replacementDuration: stickySelection.end - stickySelection.start,
      audio: appliedReplacementAudio!,
    });
  };

  const canApplyReplacement = Boolean(replacementAudio) && !replacing;
  const isAudioChanged = previewAudio !== originalAudio;
  const canContinue =
    Boolean(title.trim()) && isAudioChanged && Boolean(appliedReplacementAudio);

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="sm">
      <DialogTitle>Add Replacement</DialogTitle>
      <DialogContent>
        <AudioPlayer
          ref={passagePlayerRef}
          audioSource={previewAudio}
          height={60}
          showReplaceAI={false}
          stickySelection={stickySelection}
          highlights={[
            ...existingHighlights,
            ...(isAudioChanged
              ? [
                  {
                    start: stickySelection.start,
                    end: stickySelection.end,
                    color: "#ff660091",
                  },
                ]
              : []),
          ]}
          onAudioChange={(audio) => {
            setPreviewAudio(audio ?? undefined);
            if (!audio || audio === originalAudio) {
              setAppliedReplacementAudio(null);
              setOriginalSegmentEnd(null);
            }
          }}
          onSelectionChange={async (sel, source) => {
            if (!sel || !originalAudio) return;
            if (source === "user" && appliedReplacementAudio) {
              setReplacing(true);
              // The user dragged the replacement on the preview waveform.
              // Convert preview-time coordinates to original-time before
              // re-applying the replacement against the original audio.
              const startInOriginal = mapPreviewTimeToOriginalTime(
                sel.start,
                stickySelection.start,
                stickySelection.end,
                originalSegmentEnd!,
              );
              const endInOriginal = mapPreviewTimeToOriginalTime(
                sel.end,
                stickySelection.start,
                stickySelection.end,
                originalSegmentEnd!,
              );
              try {
                const { blob, replacementDuration } = await replaceAudioSegment(
                  originalAudio,
                  startInOriginal,
                  endInOriginal,
                  appliedReplacementAudio,
                );
                setPreviewAudio(blob);
                setStickySelection({
                  start: startInOriginal,
                  end: startInOriginal + replacementDuration,
                });
                setOriginalSegmentEnd(endInOriginal);
              } catch (e) {
                console.log(e);
                setStickySelection(sel);
              } finally {
                setReplacing(false);
              }
            } else {
              setStickySelection(sel);
            }
          }}
        />

        {/* ─── Previous Replacement Recordings (disabled) ───── */}
        <TextField
          select
          fullWidth
          disabled
          label="Previous Replacement Recordings"
          value=""
          sx={{ mt: 2 }}
        >
          <MenuItem value="">None</MenuItem>
        </TextField>

        {/* ─── Title & Note ─────────────────────────────────── */}
        <Stack direction="row" spacing={2} sx={{ my: 2 }}>
          <TextField
            label="Title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            sx={{ flex: 1 }}
            size="small"
          />
          <TextField
            label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            sx={{ flex: 1 }}
            size="small"
          />
        </Stack>

        {/* ─── Recorder player ──────────────────────────────── */}
        <AudioPlayer
          ref={replacementPlayerRef}
          height={60}
          showReplaceAI={false}
          enableDragSelection
          showRecordButton
          showCut
          showTrash
          onAudioChange={setReplacementAudio}
        />

        {/* ─── Name + Set as Replacement ────────────────────── */}
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mt: 2 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="small"
            sx={{ flex: 1 }}
          />
          <Button
            disabled={!canApplyReplacement}
            variant={
              canApplyReplacement && !hasSetReplacement ? "primary" : undefined
            }
            size="small"
            onClick={handleSetAsReplacement}
          >
            Set as Replacement
          </Button>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          variant={canContinue ? "primary" : undefined}
          disabled={!title.trim() || !isAudioChanged}
          onClick={handleContinue}
        >
          Continue
        </Button>
      </DialogActions>
    </Dialog>
  );
}
