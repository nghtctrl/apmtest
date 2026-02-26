import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  IconButton,
  Menu,
  Stack,
  Typography,
} from "@mui/material";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import CloudDoneOutlinedIcon from "@mui/icons-material/CloudDoneOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import AddIcon from "@mui/icons-material/Add";
import { useAuth } from "./AuthContext";
import { fetchAudio } from "./api";
import { AudioPlayer, type AudioPlayerHandle } from "./AudioPlayer";
import AddReplacementDialog from "./AddReplacementDialog";
import PageHeader from "./PageHeader";
import { formatTime } from "./formatTime";

interface ReplaceAIPageState {
  passageId: number;
  passageReference: string;
  projectName: string;
  speaker?: string | null;
  sectionPassages?: { id: number; reference: string; speaker: string | null }[];
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

  // Load passage audio on mount
  useEffect(() => {
    if (!token || !passageId) return;
    fetchAudio(token, passageId).then((blob) => {
      if (blob) setAudioBlob(blob);
    });
  }, [token, passageId]);

  const handleBack = () => navigate("/dashboard");

  const handleExit = () => {
    navigate("/record", { state });
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
            <CloudDoneOutlinedIcon fontSize="small" />
            <Typography variant="body2">Saved</Typography>
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
          audioSource={audioBlob ?? undefined}
          height={80}
          enableDragSelection
          showReplaceAI={false}
          onSelectionChange={setSelection}
        />

        {/* Selection range display + Add Replacement button */}
        {selection && (
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2">
              {formatTime(selection.start)} - {formatTime(selection.end)}
            </Typography>
            <Box sx={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
              <Button
                variant="primary"
                sx={{ width: "100%", maxWidth: 500 }}
                onClick={() => setAddDialogOpen(true)}
              >
                <AddIcon />
                Add Replacement
              </Button>
            </Box>
          </Stack>
        )}

        {/* Spacer */}
        <Box sx={{ flex: 1 }} />

        {/* Helper text */}
        {!selection && (
          <Typography variant="body1" sx={{ textAlign: "center", my: 24 }}>
            Drag to mark the parts you want to replace
          </Typography>
        )}
      </Box>

      <Box sx={{ px: 2, pb: 3 }}>
        <Button fullWidth disabled>
          Render Replacements
        </Button>
      </Box>

      {/* ─── Add Replacement Dialog ───────────────────────── */}
      {selection && (
        <AddReplacementDialog
          open={addDialogOpen}
          audioSource={audioBlob ?? undefined}
          selection={selection}
          onCancel={() => setAddDialogOpen(false)}
          onContinue={() => setAddDialogOpen(false)}
        />
      )}
    </Box>
  );
}
