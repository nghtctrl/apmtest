import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Box, Button, IconButton, Menu, Typography } from "@mui/material";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import CloudDoneOutlinedIcon from "@mui/icons-material/CloudDoneOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";

import { useAuth } from "./AuthContext";
import { fetchAudio } from "./api";
import { AudioPlayer, type AudioPlayerHandle } from "./AudioPlayer";
import PageHeader from "./PageHeader";

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
            px: 2,
            py: 1,
            gap: 1,
          }}
        >
          <GraphicEqIcon sx={{ color: "#000" }} />
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
        />

        {/* Spacer */}
        <Box sx={{ flex: 1 }} />

        {/* Helper text */}
        <Typography
          variant="body1"
          sx={{ textAlign: "center", color: "text.secondary", my: 4 }}
        >
          Drag to mark the parts you want to replace
        </Typography>
      </Box>

      {/* ─── Footer ───────────────────────────────────────────── */}
      <Box sx={{ px: 2, pb: 3 }}>
        <Button
          fullWidth
          disabled
          sx={{
            border: "1px solid rgba(0,0,0,0.23)",
            height: 48,
            fontSize: "1rem",
          }}
        >
          Render Replacements
        </Button>
      </Box>
    </Box>
  );
}
