import { TextInput, Text, StyleSheet, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle, TextInputProps } from 'react-native';
import { colors, spacing, radius, fontSize, sizes } from './theme';

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  style?: StyleProp<ViewStyle>;      // contenedor
  inputStyle?: StyleProp<TextStyle>; // el TextInput
  labelStyle?: StyleProp<TextStyle>;
}

export function Input({ label, style, inputStyle, labelStyle, ...props }: InputProps) {
  return (
    <View style={style}>
      {label ? <Text style={[estilos.label, labelStyle]}>{label}</Text> : null}
      <TextInput
        style={[estilos.input, inputStyle]}
        placeholderTextColor={colors.textMuted}
        {...props}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  input: {
    height: sizes.control,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  label: {
    marginBottom: spacing.xs,
    fontSize: fontSize.small,
    color: colors.textSecondary,
  },
});
