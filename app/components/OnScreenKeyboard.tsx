import { Box, Button } from "@mui/material";

const KEYBOARD_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Enter", "Z", "X", "C", "V", "B", "N", "M", "Backspace"],
] as const;

type OnScreenKeyboardProps = {
  onKeyPress: (key: string) => void;
};

export default function OnScreenKeyboard({ onKeyPress }: OnScreenKeyboardProps) {
  return (
    <Box
      sx={{
        position: "sticky",
        bottom: 0,
        width: "100%",
        bgcolor: "background.paper",
        boxShadow: "0 -2px 8px rgba(0,0,0,0.1)",
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        p: 2,
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 560, userSelect: "none" }}>
        {KEYBOARD_ROWS.map((row, rowIndex) => (
          <Box
            key={`kb-row-${rowIndex}`}
            sx={{
              display: "flex",
              justifyContent: "center",
              gap: 0.5,
              mb: 0.5,
            }}
          >
            {row.map((key) => {
              const isWide = key === "Enter" || key === "Backspace";

              return (
                <Button
                  key={key}
                  variant="contained"
                  onClick={() => {
                    onKeyPress(key);
                  }}
                  sx={{
                    minWidth: isWide ? 62 : 34,
                    px: isWide ? 1 : 0,
                    height: 44,
                    fontSize: isWide ? "0.72rem" : "0.9rem",
                    fontWeight: 700,
                    textTransform: "none",
                    bgcolor: "#818384",
                    color: "#fff",
                    '&:hover': { bgcolor: "#6f7172" },
                  }}
                  aria-label={key === "Backspace" ? "Backspace" : key}
                >
                  {key === "Backspace" ? "⌫" : key}
                </Button>
              );
            })}
          </Box>
        ))}
      </Box>
    </Box>
  );
}