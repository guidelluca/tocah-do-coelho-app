const appJson = require('./app.json');

/** Caminho publicado no GitHub Pages (nome do repositório). Só aplicado no build da CI ou com EXPO_WEB_BASE_PATH. */
const GH_PAGES_BASE = '/tocah-do-coelho-app';

function webExperiments() {
  const explicit = process.env.EXPO_WEB_BASE_PATH;
  let base = null;
  if (explicit && !['0', 'false', '/'].includes(String(explicit).trim())) {
    base = explicit.startsWith('/') ? explicit : `/${explicit}`;
  } else if (process.env.GITHUB_ACTIONS === 'true') {
    base = GH_PAGES_BASE;
  }
  if (!base) return {};
  return { baseUrl: base.replace(/\/$/, '') || GH_PAGES_BASE };
}

module.exports = () => ({
  expo: {
    ...appJson.expo,
    experiments: {
      ...(appJson.expo.experiments || {}),
      ...webExperiments(),
    },
  },
});
