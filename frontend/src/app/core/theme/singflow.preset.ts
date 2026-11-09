import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

export const SingflowPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#f5f3ff',
      100: '#ede9fe',
      200: '#ddd6fe',
      300: '#c4b5fd',
      400: '#a78bfa',
      500: '#8b5cf6',
      600: '#7C3AED',
      700: '#6d28d9',
      800: '#5b21b6',
      900: '#4c1d95',
      950: '#2e1065',
    },
    colorScheme: {
      light: {
        primary: {
          color: '{primary.600}',
          hoverColor: '{primary.700}',
          activeColor: '{primary.800}',
          contrastColor: '#ffffff',
        },
      },
    },
  },
});
