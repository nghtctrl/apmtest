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
import { replaceAudioSegment } from "./audioUtils";

interface AddReplacementDialogProps {
  open: boolean;
  /** The original passage audio */
  audioSource?: Blob;
  /** The selection range from the parent ReplaceAIPage */
  selection: { start: number; end: number };
  onCancel: () => void;
  onContinue: (data: { title: string; note: string }) => void;
}

export default function AddReplacementDialog({
  open,
  audioSource,
  selection,
  onCancel,
  onContinue,
}: AddReplacementDialogProps) {
  const previewPlayerRef = useRef<AudioPlayerHandle>(null);
  const recorderPlayerRef = useRef<AudioPlayerHandle>(null);

  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [replacementAudio, setReplacementAudio] = useState<Blob | null>(null);
  const [modifiedAudio, setModifiedAudio] = useState<Blob | null>(null);
  const [modifiedSelection, setModifiedSelection] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [replacing, setReplacing] = useState(false);

  // Reset form state when dialog opens
  useEffect(() => {
    if (open) {
      setTitle("");
      setNote("");
      setName("");
      setReplacementAudio(null);
      setModifiedAudio(null);
      setModifiedSelection(null);
      setReplacing(false);
    }
  }, [open]);

  const handleSetAsReplacement = async () => {
    if (!replacementAudio) return;
    const currentAudio = modifiedAudio ?? audioSource;
    const currentSelection = modifiedSelection ?? selection;
    if (!currentAudio) return;

    setReplacing(true);
    try {
      const { blob, replacementDuration } = await replaceAudioSegment(
        currentAudio,
        currentSelection.start,
        currentSelection.end,
        replacementAudio,
      );
      setModifiedAudio(blob);
      setModifiedSelection({
        start: currentSelection.start,
        end: currentSelection.start + replacementDuration,
      });
    } catch {
      // Replacement failed — leave audio unchanged
    } finally {
      setReplacing(false);
    }
  };

  const handleContinue = () => {
    onContinue({ title: title.trim(), note: note.trim() });
  };

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="sm">
      <DialogTitle>Add Replacement</DialogTitle>
      <DialogContent>
        {/* ─── Preview player (shows the selected region) ───── */}
        <AudioPlayer
          ref={previewPlayerRef}
          audioSource={modifiedAudio ?? audioSource}
          height={60}
          showReplaceAI={false}
          initialSelection={modifiedSelection ?? selection}
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
          ref={recorderPlayerRef}
          height={60}
          showReplaceAI={false}
          enableDragSelection
          showRecordButton
          showCut
          showTrash
          onAudioChange={setReplacementAudio}
        />

        {/* ─── Name + Set as Replacement ────────────────────── */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={2}
          sx={{ mt: 2 }}
        >
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="small"
            sx={{ flex: 1 }}
          />
          <Button
            disabled={!replacementAudio || replacing}
            variant="primary"
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
          variant="primary"
          disabled
          onClick={handleContinue}
        >
          Continue
        </Button>
      </DialogActions>
    </Dialog>
  );
}
