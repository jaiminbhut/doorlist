import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * One app config, three variants (ADR 9), picked by APP_VARIANT:
 * - development: a dev client for local work, against the API on your machine
 * - preview: an internal build for testing on real phones
 * - production: the store build
 * Each variant has its own name, bundle id and URL scheme, so all three can be
 * installed side by side. The API address is never guessed for a non-development
 * build: eas.json sets EXPO_PUBLIC_API_URL for each profile.
 */
type Variant = 'development' | 'preview' | 'production';

const variant: Variant = parseVariant(process.env.APP_VARIANT);

const names: Record<Variant, string> = {
  development: 'Doorlist Dev',
  preview: 'Doorlist Preview',
  production: 'Doorlist',
};

const suffix = variant === 'production' ? '' : `.${variant === 'development' ? 'dev' : 'preview'}`;
const identifier = `com.devtownhall.doorlist${suffix}`;

// Fonts are embedded at build time. Each face is named after its PostScript
// name on both platforms, so styles use one name everywhere (src/theme/type.ts).
const googleFonts = './node_modules/@expo-google-fonts';
const fonts = [
  {
    name: 'BigShoulders-ExtraBold',
    weight: 800,
    path: `${googleFonts}/big-shoulders/800ExtraBold/BigShoulders_800ExtraBold.ttf`,
  },
  {
    name: 'AtkinsonHyperlegibleNext-Regular',
    weight: 400,
    path: `${googleFonts}/atkinson-hyperlegible-next/400Regular/AtkinsonHyperlegibleNext_400Regular.ttf`,
  },
  {
    name: 'AtkinsonHyperlegibleNext-Bold',
    weight: 700,
    path: `${googleFonts}/atkinson-hyperlegible-next/700Bold/AtkinsonHyperlegibleNext_700Bold.ttf`,
  },
];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: names[variant],
  slug: 'doorlist',
  version: '0.1.0',
  scheme: variant === 'production' ? 'doorlist' : `doorlist-${variant}`,
  platforms: ['ios', 'android'],
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: identifier,
    supportsTablet: true,
  },
  android: {
    package: identifier,
    adaptiveIcon: {
      backgroundColor: '#5b2bd0',
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 96,
        backgroundColor: '#efedf6',
        dark: { image: './assets/splash-icon.png', backgroundColor: '#120e1c' },
      },
    ],
    [
      'expo-font',
      {
        ios: { fonts: fonts.map((font) => font.path) },
        android: {
          fonts: fonts.map((font) => ({
            fontFamily: font.name,
            fontDefinitions: [{ path: font.path, weight: font.weight }],
          })),
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    variant,
  },
});

function parseVariant(value: string | undefined): Variant {
  if (value === undefined || value === '') {
    return 'development';
  }
  if (value === 'development' || value === 'preview' || value === 'production') {
    return value;
  }
  throw new Error(`APP_VARIANT must be development, preview or production, not "${value}".`);
}
