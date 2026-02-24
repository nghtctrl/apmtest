import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AppBar,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  IconButton,
  Snackbar,
  Toolbar,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";

import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import { useAuth } from "./AuthContext";
import { uploadAudio, fetchAudio, getSpeakers, type Speaker } from "./api";
import { compressToMp3 } from "./audioUtils";
import SpeakerDialog from "./SpeakerDialog";
import { AudioPlayer } from "./AudioPlayer";

interface RecordPageState {
  passageId: number;
  passageReference: string;
  projectName: string;
}

/** Hardcoded step colours for the racetrack indicator */
const STEP_COLORS = [
  "#111",
  "#ccc",
  "#ccc",
  "#ccc",
  "#ccc",
  "#ccc",
  "#ccc",
  "#ccc",
  "#ccc",
  "#ccc",
];

export default function RecordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();
  const state = (location.state ?? {}) as RecordPageState;

  const passageIdFromQuery = Number(
    new URLSearchParams(location.search).get("passageId")
  );
  const passageId =
    state.passageId || (Number.isFinite(passageIdFromQuery) ? passageIdFromQuery : 0);
  const passageReference = state.passageReference ?? "Unknown Passage";
  const projectName = state.projectName ?? "";

  // Audio state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [snackMsg, setSnackMsg] = useState<string | null>(null);

  // Speaker state
  const [speakerDialogOpen, setSpeakerDialogOpen] = useState(false);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);

  // Fetch speakers list on mount
  useEffect(() => {
    if (!token) return;
    getSpeakers(token)
      .then((data) => setSpeakers(data.speakers))
      .catch(() => {/* silent — list will just be empty */});
  }, [token]);

  // Load existing audio for this passage on mount
  useEffect(() => {
    if (!token || !passageId) return;
    fetchAudio(token, passageId).then((blob) => {
      if (blob) setAudioBlob(blob);
    });
  }, [token, passageId]);

  const busy = compressing || uploading;

  async function handleFileSelected(file: File) {
    if (!token) {
      setSnackMsg("You are not logged in. Please sign in again.");
      return;
    }
    if (!passageId) {
      setSnackMsg("Missing passage ID. Return to Dashboard and open Record from a passage card.");
      return;
    }
    try {
      setCompressing(true);
      const mp3Blob = await compressToMp3(file, 64);

      // Netlify Functions have a ~6 MB body limit (AWS Lambda)
      const MAX_UPLOAD = 5.5 * 1024 * 1024;
      if (mp3Blob.size > MAX_UPLOAD) {
        const sizeMB = (mp3Blob.size / (1024 * 1024)).toFixed(1);
        throw new Error(
          `Compressed audio is ${sizeMB} MB — exceeds the 5.5 MB upload limit. Try a shorter recording.`
        );
      }

      setCompressing(false);
      setUploading(true);
      await uploadAudio(token, passageId, mp3Blob);

      // Set audio source for playback
      setAudioBlob(mp3Blob);
      setSnackMsg("Audio saved!");
    } catch (err) {
      setSnackMsg(err instanceof Error ? err.message : "Failed to process audio");
    } finally {
      setCompressing(false);
      setUploading(false);
    }
  }

  function handleLoadFromFileClick() {
    if (!token) {
      setSnackMsg("You are not logged in. Please sign in again.");
      return;
    }
    if (!passageId) {
      setSnackMsg("Missing passage ID. Return to Dashboard and open Record from a passage card.");
      return;
    }
    fileInputRef.current?.click();
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
      }}
    >
      {/* ─── Header ───────────────────────────────────────────────── */}
      <AppBar
        position="sticky"
        elevation={0}
        color="default"
        sx={{ bgcolor: "#eee" }}
      >
        <Toolbar sx={{ gap: 1 }}>
          <IconButton size="small" onClick={() => navigate("/dashboard")}>
            <ArrowBackIcon />
          </IconButton>

          <Box sx={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: "normal" }}>
              {passageReference}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {projectName}
            </Typography>
          </Box>

          <IconButton size="small">
            <HelpOutlineIcon />
          </IconButton>
          <IconButton size="small">
            <AccountCircleIcon />
          </IconButton>
        </Toolbar>

        {/* Racetrack row */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            pb: 1,
            px: 2,
          }}
        >
          <Box
            sx={{
              width: "100%",
              px: .5,
              overflowX: "auto",
            }}
          >
            <Box sx={{ display: "flex", width: "fit-content", mx: "auto" }}>
              {STEP_COLORS.map((color, i) => (
                <Box
                  key={i}
                  sx={{
                    flex: "0 0 80px",
                    height: 30,
                    bgcolor: color,
                    mx: -0.25,
                    clipPath: "polygon(10% 0%, 100% 0%, 90% 100%, 0% 100%)",
                  }}
                />
              ))}
            </Box>
          </Box>
          <Typography sx={{ mt: 1, fontWeight: 500 }}>
            Record
          </Typography>
        </Box>
      </AppBar>

      {/* ─── Main Content ─────────────────────────────────────────── */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
          position: "relative",
        }}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelected(file);
            e.target.value = ""; // reset so same file can be re-selected
          }}
        />

        {/* Select Speaker & Load from File */}
        <Box sx={{ display: "flex", gap: 1, p: 2 }}>
          <Button
            variant={selectedSpeaker ? undefined : "primary"}
            startIcon={<PersonOutlineIcon />}
            sx={{ width: "100%", maxWidth: 260 }}
            onClick={() => {
              setSpeakerDialogOpen(true);
            }}
          >
            {selectedSpeaker || "Select Speaker..."}
          </Button>
          <Button
            startIcon={busy ? <CircularProgress size={18} /> : <FolderOpenIcon />}
            sx={{ width: "100%", maxWidth: 260 }}
            disabled={busy || !selectedSpeaker}
            onClick={handleLoadFromFileClick}
          >
            {busy ? "Uploading..." : "Load from File..."}
          </Button>
        </Box>

        {/* Audio player / waveform */}
        <Box sx={{ px: 2 }}>
          <AudioPlayer
            audioSource={audioBlob ?? undefined}
            height={80}
          />
        </Box>

        {/* Spacer pushes record button toward bottom */}
        <Box sx={{ flex: 1 }} />

        {/* Record button (disabled, centered) */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            py: 4,
          }}
        >
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              border: "25px solid",
              borderColor: selectedSpeaker ? "alert.main" : "#d0d0d0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "default",
              opacity: selectedSpeaker ? 1 : 0.6,
            }}
          >
          </Box>
        </Box>

        {/* Floating Discussions button */}
        <IconButton
          variant="floating"
          sx={{ position: "absolute", bottom: 16, right: 16 }}
          onClick={() => {
            /* stub */
          }}
        >
          <ChatBubbleOutlineIcon />
        </IconButton>
      </Box>

      {/* ─── Footer ───────────────────────────────────────────────── */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: 1,
          borderColor: "divider",
          bgcolor: "#eee",
          px: 1,
          py: 1,
        }}
      >
        <Button
          startIcon={<ChevronLeftIcon />}
          sx={{ width: 95 }}
          onClick={() => {
            /* stub */
          }}
        >
          Previous
        </Button>

        <Button
          startIcon={<Checkbox size="small" sx={{ p: 0 }} disabled />}
          onClick={() => {
            /* stub */
          }}
        >
          Step Complete
        </Button>

        <Button
          endIcon={<ChevronRightIcon />}
          sx={{ width: 90 }}
          onClick={() => {
            /* stub */
          }}
        >
          Next
        </Button>
      </Box>

      {/* Snackbar for status messages */}
      <Snackbar
        open={!!snackMsg}
        autoHideDuration={3000}
        onClose={() => setSnackMsg(null)}
        message={snackMsg}
      />

      <SpeakerDialog
        open={speakerDialogOpen}
        token={token}
        options={speakers.map((s) => s.name)}
        initialValue={selectedSpeaker ?? ""}
        onClose={() => setSpeakerDialogOpen(false)}
        onSpeakerSelected={(speakerName) => {
          setSelectedSpeaker(speakerName);
          setSpeakers((prev) => {
            if (prev.some((speaker) => speaker.name === speakerName)) return prev;
            return [...prev, { name: speakerName }].sort((a, b) =>
              a.name.localeCompare(b.name)
            );
          });
        }}
        onError={setSnackMsg}
      />
    </Box>
  );
}
