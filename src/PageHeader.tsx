import React from "react";
import { AppBar, IconButton, Toolbar, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";

interface PageHeaderProps {
  title: string;
  onBack: () => void;
  /** Extra content rendered inside the AppBar below the toolbar (e.g. racetrack) */
  children?: React.ReactNode;
}

export default function PageHeader({ title, onBack, children }: PageHeaderProps) {
  return (
    <AppBar
      position="sticky"
      elevation={0}
      color="default"
      sx={{ bgcolor: "#eee", borderBottom: 1, borderColor: "black" }}
    >
      <Toolbar sx={{ gap: 1 }}>
        <IconButton size="small" onClick={onBack}>
          <ArrowBackIcon />
        </IconButton>

        <Typography
          variant="subtitle1"
          sx={{ fontWeight: 600, flexGrow: 1 }}
        >
          {title}
        </Typography>

        <IconButton size="small">
          <HelpOutlineIcon />
        </IconButton>
        <IconButton size="small">
          <AccountCircleIcon />
        </IconButton>
      </Toolbar>
      {children}
    </AppBar>
  );
}
