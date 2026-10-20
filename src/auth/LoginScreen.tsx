import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { COUNTRIES } from '../data/countries';
import type { Country } from '../data/countries';
import { COUNTRY_CALLING_CODES } from '../data/countryCallingCodes';
import { userGatewayClient } from '../api/userGatewayClient';
import type { AuthenticatedUser } from '../api/userGatewayClient';

interface LoginScreenProps {
  onAuthenticated: (user: AuthenticatedUser, token: string) => Promise<void>;
}

export default function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [requestedMobile, setRequestedMobile] = useState('');
  const [country, setCountry] = useState<Country>(COUNTRIES.find((item) => item.code === 'IN') || COUNTRIES[0]);
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [otp, setOtp] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const filteredCountries = useMemo(() => {
    const query = countrySearch.trim().toLocaleLowerCase();
    return query
      ? COUNTRIES.filter((item) => item.name.toLocaleLowerCase().includes(query) || item.code.toLowerCase() === query)
      : COUNTRIES;
  }, [countrySearch]);

  const requestOtp = async () => {
    setError('');
    if (!name.trim()) return setError('Enter your name.');
    const enteredNumber = mobile.replace(/[\s()-]/g, '');
    const callingCode = COUNTRY_CALLING_CODES[country.code];
    const normalizedMobile = enteredNumber.startsWith('+')
      ? enteredNumber
      : callingCode
        ? `+${callingCode}${enteredNumber.replace(/\D/g, '')}`
        : '';
    if (!/^\+[1-9]\d{7,14}$/.test(normalizedMobile)) {
      return setError(callingCode
        ? 'Enter a valid mobile number for the selected country.'
        : 'Enter the full mobile number with its +country calling code.');
    }
    setBusy(true);
    try {
      await userGatewayClient.requestOtp({
        name: name.trim(),
        mobile: normalizedMobile,
        countryCode: country.code,
        country: country.name,
      });
      setRequestedMobile(normalizedMobile);
      setOtpRequested(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not request a verification code.');
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    setError('');
    if (!/^\d{6}$/.test(otp)) return setError('Enter the 6-digit verification code.');
    setBusy(true);
    try {
      const session = await userGatewayClient.verifyOtp(requestedMobile, otp);
      await onAuthenticated(session.user, session.token);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Could not verify that code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brandMark}><Text style={styles.brandMarkText}>GHA</Text></View>
        <Text style={styles.title}>Welcome to GHA</Text>
        <Text style={styles.subtitle}>Sign in with your mobile number to continue.</Text>

        {!otpRequested ? (
          <>
            <Text style={styles.label}>Your name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Full name"
              autoCapitalize="words"
              style={styles.input}
              returnKeyType="next"
            />

            <Text style={styles.label}>Country</Text>
            <TouchableOpacity style={styles.countryButton} onPress={() => setCountryModalVisible(true)}>
              <Text style={styles.countryName}>{country.name}</Text>
              <Text style={styles.chevron}>⌄</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Mobile number</Text>
            <View style={styles.phoneInput}>
              <Text style={styles.phonePrefix}>+{COUNTRY_CALLING_CODES[country.code] || '…'}</Text>
              <TextInput
                value={mobile}
                onChangeText={setMobile}
                placeholder="98765 43210"
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                style={styles.phoneNumberInput}
              />
            </View>
            <Text style={styles.hint}>The selected country’s calling code is added automatically. During development, the verification code appears in the notification-service logs.</Text>

            <TouchableOpacity disabled={busy} onPress={requestOtp} style={[styles.primaryButton, busy && styles.disabledButton]}>
              {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Send verification code</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.otpPrompt}>Enter the 6-digit code shown in the notification-service logs for {requestedMobile}.</Text>
            <TextInput
              value={otp}
              onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              maxLength={6}
              style={[styles.input, styles.otpInput]}
            />
            <TouchableOpacity disabled={busy} onPress={verifyOtp} style={[styles.primaryButton, busy && styles.disabledButton]}>
              {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Verify and sign in</Text>}
            </TouchableOpacity>
            <TouchableOpacity disabled={busy} onPress={requestOtp} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Resend code</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setOtpRequested(false); setOtp(''); setError(''); }} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Change details</Text>
            </TouchableOpacity>
          </>
        )}

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <Modal visible={countryModalVisible} animationType="slide" onRequestClose={() => setCountryModalVisible(false)}>
        <SafeAreaView style={styles.modalScreen}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Choose your country</Text>
            <TouchableOpacity onPress={() => { setCountryModalVisible(false); setCountrySearch(''); }}>
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            value={countrySearch}
            onChangeText={setCountrySearch}
            placeholder="Search countries"
            autoCorrect={false}
            style={styles.searchInput}
          />
          <ScrollView keyboardShouldPersistTaps="handled">
            {filteredCountries.map((item) => {
              const selected = item.code === country.code;
              return (
                <TouchableOpacity
                  key={item.code}
                  style={[styles.countryOption, selected && styles.countryOptionSelected]}
                  onPress={() => { setCountry(item); setCountryModalVisible(false); setCountrySearch(''); }}
                >
                  <Text style={styles.countryOptionName}>{item.name}</Text>
                  <Text style={styles.countryCode}>{item.code}{selected ? '  ✓' : ''}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  brandMark: { width: 58, height: 58, borderRadius: 18, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  brandMarkText: { color: '#ffffff', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  title: { color: '#0f172a', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#64748b', fontSize: 15, lineHeight: 22, marginTop: 7, marginBottom: 28 },
  label: { color: '#334155', fontSize: 13, fontWeight: '700', marginBottom: 7, marginTop: 14 },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, backgroundColor: '#ffffff', paddingHorizontal: 14, color: '#0f172a', fontSize: 16 },
  phoneInput: { minHeight: 52, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, backgroundColor: '#ffffff', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  phonePrefix: { color: '#0f172a', fontSize: 16, fontWeight: '700', paddingRight: 12, borderRightWidth: 1, borderRightColor: '#cbd5e1' },
  phoneNumberInput: { flex: 1, minHeight: 50, paddingLeft: 12, color: '#0f172a', fontSize: 16 },
  countryButton: { minHeight: 52, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, backgroundColor: '#ffffff', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countryName: { color: '#0f172a', fontSize: 16 },
  chevron: { color: '#64748b', fontSize: 22 },
  hint: { color: '#64748b', fontSize: 12, lineHeight: 18, marginTop: 7 },
  primaryButton: { minHeight: 52, borderRadius: 12, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', marginTop: 25, paddingHorizontal: 14 },
  disabledButton: { opacity: 0.65 },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', padding: 15 },
  secondaryButtonText: { color: '#334155', fontWeight: '700' },
  otpPrompt: { color: '#475569', fontSize: 15, lineHeight: 22, marginTop: 24, marginBottom: 15 },
  otpInput: { textAlign: 'center', fontSize: 24, fontWeight: '700', letterSpacing: 8 },
  error: { color: '#b91c1c', fontSize: 13, lineHeight: 19, marginTop: 18 },
  modalScreen: { flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 18 },
  modalHeader: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: '#0f172a', fontSize: 18, fontWeight: '700' },
  doneText: { color: '#0369a1', fontSize: 15, fontWeight: '700' },
  searchInput: { minHeight: 48, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#ffffff', paddingHorizontal: 13, marginBottom: 10, fontSize: 15 },
  countryOption: { minHeight: 50, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#cbd5e1', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 7 },
  countryOptionSelected: { backgroundColor: '#e2e8f0' },
  countryOptionName: { color: '#0f172a', fontSize: 15 },
  countryCode: { color: '#64748b', fontSize: 12 },
});
