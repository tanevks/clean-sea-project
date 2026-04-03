import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { signInWithGoogle, signUpWithEmail } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { authStyles } from "./styles";

type Props = {
  onBackToLogin: () => void;
  onSignedUp: () => void;
};

export function SignUpScreen({ onBackToLogin, onSignedUp }: Props) {
  const { t } = useI18n();
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  async function onSignUp() {
    setMessage("");
    setErrorMessage("");

    if (!nickname.trim() || !email.trim() || !password) {
      setErrorMessage(t.auth.signUpRequired);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage(t.auth.passwordsDoNotMatch);
      return;
    }

    setIsSubmitting(true);
    const { error, hasSession } = await signUpWithEmail(
      email.trim(),
      password,
      nickname.trim(),
      phone.trim()
    );
    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    if (hasSession) {
      onSignedUp();
      return;
    }

    setMessage(t.auth.signUpCheckEmail);
  }

  async function onGoogleSignUp() {
    setMessage("");
    setErrorMessage("");
    setIsSubmitting(true);

    const { user, error, pendingExternalAuth } = await signInWithGoogle();
    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }
    if (pendingExternalAuth) {
      return;
    }
    if (!user) {
      setErrorMessage(t.auth.googleCanceled);
      return;
    }

    onSignedUp();
  }

  return (
    <View style={authStyles.container}>
      <Text style={authStyles.title}>{t.auth.signUpTitle}</Text>
      {errorMessage ? (
        <Text style={authStyles.messageError}>{errorMessage}</Text>
      ) : null}
      {message ? <Text style={authStyles.messageSuccess}>{message}</Text> : null}

      <View style={authStyles.fieldGroup}>
        <Text style={authStyles.label}>{t.auth.usernameLabel}</Text>
        <TextInput
          placeholder={t.auth.usernamePlaceholder}
          style={authStyles.input}
          value={nickname}
          onChangeText={setNickname}
        />
      </View>

      <View style={authStyles.fieldGroup}>
        <Text style={authStyles.label}>{t.auth.phoneLabel}</Text>
        <TextInput
          placeholder={t.auth.phonePlaceholder}
          style={authStyles.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
      </View>

      <View style={authStyles.fieldGroup}>
        <Text style={authStyles.label}>{t.auth.emailLabel}</Text>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder={t.auth.emailPlaceholder}
          style={authStyles.input}
          value={email}
          onChangeText={setEmail}
        />
      </View>

      <View style={authStyles.fieldGroup}>
        <Text style={authStyles.label}>{t.auth.passwordLabel}</Text>
        <View style={authStyles.passwordRow}>
          <TextInput
            secureTextEntry={!showPassword}
            placeholder={t.auth.passwordPlaceholder}
            style={authStyles.passwordInput}
            value={password}
            onChangeText={setPassword}
          />
          <Pressable
            style={authStyles.passwordToggle}
            onPress={() => setShowPassword((value) => !value)}
          >
            <Text style={authStyles.passwordToggleText}>
              {showPassword ? t.common.hide : t.common.show}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={authStyles.fieldGroup}>
        <Text style={authStyles.label}>{t.auth.confirmPasswordLabel}</Text>
        <View style={authStyles.passwordRow}>
          <TextInput
            secureTextEntry={!showConfirmPassword}
            placeholder={t.auth.confirmPasswordPlaceholder}
            style={authStyles.passwordInput}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />
          <Pressable
            style={authStyles.passwordToggle}
            onPress={() => setShowConfirmPassword((value) => !value)}
          >
            <Text style={authStyles.passwordToggleText}>
              {showConfirmPassword ? t.common.hide : t.common.show}
            </Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        style={[authStyles.button, isSubmitting ? authStyles.buttonDisabled : null]}
        onPress={() => void onSignUp()}
        disabled={isSubmitting}
      >
        <Text style={authStyles.buttonText}>{t.auth.signUpButton}</Text>
      </Pressable>

      <Pressable
        style={[
          authStyles.button,
          authStyles.buttonSecondary,
          isSubmitting ? authStyles.buttonDisabled : null
        ]}
        onPress={() => void onGoogleSignUp()}
        disabled={isSubmitting}
      >
        <Text style={[authStyles.buttonText, authStyles.buttonTextSecondary]}>
          {t.auth.googleButton}
        </Text>
      </Pressable>

      <Text style={authStyles.link} onPress={onBackToLogin}>
        {t.auth.backToLogin}
      </Text>
    </View>
  );
}
