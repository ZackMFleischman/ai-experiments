import { createTheme } from "@mui/material/styles";

/** Dark cockpit theme — palette carried over from the old console.html CSS vars. */
export const theme = createTheme({
  palette: {
    mode: "dark",
    background: { default: "#0b0c10", paper: "#14161c" },
    divider: "#262a33",
    text: { primary: "#c8cdd8", secondary: "#6b7280" },
    primary: { main: "#3ddc97" }, // accent
    warning: { main: "#f3c969" },
    error: { main: "#e6455a" },
  },
  typography: {
    fontFamily: "system-ui, sans-serif",
    fontSize: 13,
  },
  components: {
    MuiButton: {
      defaultProps: { variant: "outlined", size: "small", color: "inherit" },
      // Validators compare button textContent ("stage"/"unstage"/"cc21") —
      // uppercase styling is CSS-only and harmless, but keep labels readable.
      styleOverrides: { root: { textTransform: "none" } },
    },
    MuiTextField: { defaultProps: { size: "small" } },
  },
});
