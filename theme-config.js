(() => {
  // Change only this value when switching the active seasonal theme.
  const currentTheme = "autumn";
  const themeColors = {
    summer: "#0E5A66",
    autumn: "#263B52",
  };

  document.documentElement.dataset.theme = currentTheme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", themeColors[currentTheme] ?? themeColors.autumn);
})();
