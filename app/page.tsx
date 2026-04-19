"use client";

import React from "react";
import { ThemeProvider, createTheme, CssBaseline, Container, Typography, Box } from "@mui/material";
import GameGrid from "./components/GameGrid";
import { shortCommitSha } from "../lib/config";

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#121213', // Wordle dark background
      paper: '#121213',
    },
  },
  typography: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
});

export default function Page() {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Container
        maxWidth="sm"
        sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}
      >
        <Box sx={{ borderBottom: 1, borderColor: 'divider', py: 2, mb: 4 }}>
          <Typography variant="h4" component="h1" align="center" fontWeight="bold">
            Cheatle
          </Typography>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center' }}>
          <GameGrid />
        </Box>

        {shortCommitSha && (
          <Typography
            variant="caption"
            align="center"
            sx={{ pt: 2, pb: 1.5, color: 'text.disabled', letterSpacing: '0.08em' }}
          >
            build {shortCommitSha}
          </Typography>
        )}
      </Container>
    </ThemeProvider>
  );
}
