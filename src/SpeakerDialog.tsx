import { useEffect, useState } from "react";
import {
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { createSpeaker } from "./api";

interface SpeakerDialogProps {
  open: boolean;
  token: string | null;
  options: string[];
  initialValue: string;
  onClose: () => void;
  onSpeakerSelected: (speakerName: string) => void;
  onError: (message: string) => void;
}

export default function SpeakerDialog({
  open,
  token,
  options,
  initialValue,
  onClose,
  onSpeakerSelected,
  onError,
}: SpeakerDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
    }
  }, [open, initialValue]);

  async function handleConfirm() {
    const name = value.trim();
    if (!name) return;
    if (!token) {
      onError("You are not logged in.");
      return;
    }

    try {
      setSaving(true);
      const { speaker } = await createSpeaker(token, name);
      onSpeakerSelected(speaker.name);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save speaker");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={(_, reason) => reason !== "backdropClick" && onClose()} fullWidth maxWidth="xs">
      <DialogTitle>Select or Add Speaker</DialogTitle>
      <DialogContent>
        <Autocomplete
          freeSolo
          options={options}
          value={value}
          onChange={(_event, newValue) => setValue(newValue ?? "")}
          onInputChange={(_event, newValue) => setValue(newValue)}
          renderInput={(params) => (
            <TextField
              {...params}
              autoFocus
              label="Speaker"
              placeholder="Type a new name or select..."
              margin="dense"
              fullWidth
            />
          )}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={!value.trim() || saving}
          onClick={handleConfirm}
        >
          {saving ? "Saving..." : "Confirm"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
