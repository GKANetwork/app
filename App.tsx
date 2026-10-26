import React, { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Linking,
  Alert,
} from 'react-native';
import LoginScreen from './src/auth/LoginScreen';
import { LearnWorldsSsoAdapter } from './src/api/learnWorldsSsoClient';
import { GhaSpringCloudGatewayAdapter } from './src/api/eventGatewayClient';
import type { LandingCategory, MobileLandingSection } from './src/api/eventGatewayClient';
import { userGatewayClient } from './src/api/userGatewayClient';
import type { AuthenticatedUser } from './src/api/userGatewayClient';

const landingLinks = [
  { name: 'GConvene', uri: 'https://gtek4u.com/static/app-images/GConvene.png', category: 'Conference' as const },
  { name: 'GDA', uri: 'https://gtek4u.com/static/app-images/GDA.png', category: 'CME' as const },
  { name: 'GHA', uri: 'https://gtek4u.com/static/app-images/GHA.png', category: null },
  { name: 'GSI', uri: 'https://gtek4u.com/static/app-images/GSI.png', category: 'GSI' as const },
  { name: 'GHASTEP', uri: 'https://gtek4u.com/static/app-images/GHASTEP.png', category: 'GHASTEP' as const },
  { name: 'GMEDKONNECT', uri: 'https://gtek4u.com/static/app-images/GMEDKONNECT.png', category: 'GMEDKONNECT' as const },
  { name: 'AHS', uri: 'https://gtek4u.com/static/app-images/AHS.png', category: 'AHS' as const },
];

const categoryLabels: Record<LandingCategory, string> = {
  CME: 'CME',
  GSI: 'GSI',
  AHS: 'Course / AHS',
  Conference: 'Conference',
  GHASTEP: 'GHASTEP',
  GMEDKONNECT: 'GMEDKONNECT',
};

const learnWorldsSso = new LearnWorldsSsoAdapter();
const eventGateway = new GhaSpringCloudGatewayAdapter();
// LearnWorlds school home page; set the Expo public variable to the direct
// learner sign-up URL if the school has one configured.
const learnWorldsRegistrationUrl = process.env.EXPO_PUBLIC_LEARNWORLDS_REGISTRATION_URL
  || 'https://courses.globalhealthcareacademy.in';

export default function App() {
  const [sessionReady, setSessionReady] = useState(false);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [activeScreen, setActiveScreen] = useState<'landing' | 'profile' | 'registrations'>('landing');
  const [ssoLoading, setSsoLoading] = useState(false);
  const [selectedVertical, setSelectedVertical] = useState<LandingCategory | null>(null);
  const [selectedLandingTitle, setSelectedLandingTitle] = useState('');
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [publishedSections, setPublishedSections] = useState<MobileLandingSection[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [sectionsError, setSectionsError] = useState('');
  const [sectionsRetry, setSectionsRetry] = useState(0);

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      try {
        const token = await SecureStore.getItemAsync('gha.session.token');
        if (!token) return;
        const restoredUser = await userGatewayClient.getSession(token);
        if (active) setUser(restoredUser);
      } catch (error) {
        console.error('[GHA-MOBILE] Session restore failed:', error);
        await SecureStore.deleteItemAsync('gha.session.token');
      } finally {
        if (active) setSessionReady(true);
      }
    };
    restoreSession();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user || !selectedVertical) {
      setPublishedSections([]);
      setSectionsLoading(false);
      setSectionsError('');
      return;
    }

    let active = true;
    const category = selectedVertical;
    setSectionsLoading(true);
    setSectionsError('');
    eventGateway.fetchPublishedLandingSections(category)
      .then((sections) => {
        if (active) setPublishedSections(sections);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[GHA-MOBILE] Could not load published ${category} landing sections:`, error);
        if (active) {
          setPublishedSections([]);
          setSectionsError(message);
        }
      })
      .finally(() => {
        if (active) setSectionsLoading(false);
      });

    return () => { active = false; };
  }, [user?.id, selectedVertical, sectionsRetry]);

  const openLandingLink = (name: string, category: LandingCategory | null) => {
    if (name === 'GHA') {
      void openLearnWorlds();
      return;
    }
    setSelectedLandingTitle(name);
    setSelectedVertical(category);
  };

  const returnToLanding = () => {
    setSelectedVertical(null);
    setSelectedLandingTitle('');
  };

  const saveSession = async (authenticatedUser: AuthenticatedUser, token: string) => {
    await SecureStore.setItemAsync('gha.session.token', token);
    setUser(authenticatedUser);
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('gha.session.token');
    setUser(null);
  };

  const openLearnWorlds = async () => {
    if (ssoLoading) return;
    setSsoLoading(true);
    try {
      const token = await SecureStore.getItemAsync('gha.session.token');
      if (!token) throw new Error('Your GHA session has expired. Sign in again and retry.');
      const ssoUrl = await learnWorldsSso.createLoginUrl(token);
      await Linking.openURL(ssoUrl);
    } catch (error) {
      console.error('[GHA-MOBILE] LearnWorlds SSO connection failed:', error);
      try {
        console.info('[GHA-MOBILE] Opening LearnWorlds learner registration fallback:', learnWorldsRegistrationUrl);
        await Linking.openURL(learnWorldsRegistrationUrl);
      } catch (registrationError) {
        console.error('[GHA-MOBILE] Could not open LearnWorlds learner registration:', registrationError);
        const message = registrationError instanceof Error ? registrationError.message : String(registrationError);
        Alert.alert('Could not open LearnWorlds', `SSO failed and registration could not be opened: ${message}`);
      }
    } finally {
      setSsoLoading(false);
    }
  };

  const handleImagePressRedirect = async (targetUrl: string) => {
    try {
      const normalizedUrl = /^https?:\/\//i.test(targetUrl) ? targetUrl : `https://${targetUrl}`;
      const parsed = new URL(normalizedUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported link protocol');
      await Linking.openURL(parsed.toString());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[GHA-MOBILE] Could not open published landing content URL:', error);
      Alert.alert('Could not open link', message);
    }
  };

  if (!sessionReady) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerBox}><ActivityIndicator size="large" color="#0f172a" /></View>
      </SafeAreaView>
    );
  }

  if (!user) return <LoginScreen onAuthenticated={saveSession} />;

  if (activeScreen === 'registrations') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.profileHeader}>
          <TouchableOpacity
            onPress={() => setActiveScreen('profile')}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back to profile"
          >
            <Text style={styles.backButtonText}>‹</Text>
            <Text style={styles.backButtonLabel}>Profile</Text>
          </TouchableOpacity>
          <Text style={styles.profileHeaderTitle}>Registrations</Text>
          <TouchableOpacity
            onPress={logout}
            style={styles.logoutButton}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Text style={styles.logoutIcon}>↪</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.profileScroll} contentContainerStyle={styles.registrationContent}>
          <Text style={styles.registrationIntro}>
            Your course, conference, and lab registrations and enrollments will appear here.
          </Text>
          <View style={styles.registrationEmptyCard}>
            <View style={styles.registrationEmptyIcon}>
              <Text style={styles.registrationEmptyIconText}>▤</Text>
            </View>
            <Text style={styles.registrationEmptyTitle}>No registrations yet</Text>
            <Text style={styles.registrationMessage}>
              Once registration records are connected, items created within the last 30 days will be marked New.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (activeScreen === 'profile') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.profileHeader}>
          <TouchableOpacity
            onPress={() => setActiveScreen('landing')}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back to landing page"
          >
            <Text style={styles.backButtonText}>‹</Text>
            <Text style={styles.backButtonLabel}>Landing</Text>
          </TouchableOpacity>
          <Text style={styles.profileHeaderTitle}>My Profile</Text>
          <TouchableOpacity
            onPress={logout}
            style={styles.logoutButton}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Text style={styles.logoutIcon}>↪</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.profileScroll} contentContainerStyle={styles.profileContent}>
          <View style={styles.identityCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}
              </Text>
            </View>
            <Text style={styles.profileName}>{user.name}</Text>
            <Text style={styles.profileSubheading}>GHA Member</Text>
          </View>

          <Text style={styles.profileSectionTitle}>Personal details</Text>
          <View style={styles.detailsCard}>
            <ProfileDetail label="Email" value={user.email || '—'} />
            <View style={styles.detailDivider} />
            <ProfileDetail label="Mobile" value={user.mobile} />
            <View style={styles.detailDivider} />
            <ProfileDetail label="Country" value={user.country || '—'} />
          </View>

          <TouchableOpacity
            onPress={() => setActiveScreen('registrations')}
            style={styles.registerEntry}
            accessibilityRole="button"
            accessibilityLabel="View registrations and enrollments"
          >
            <View style={styles.registerEntryIcon}><Text style={styles.registerEntryIconText}>＋</Text></View>
            <View style={styles.registerEntryCopy}>
              <Text style={styles.registerEntryTitle}>Registrations &amp; enrollments</Text>
              <Text style={styles.registerEntryDescription}>Your course, conference, and lab activity</Text>
            </View>
            <Text style={styles.registerEntryArrow}>›</Text>
          </TouchableOpacity>

          <Text style={styles.profileSectionTitle}>Your GHA access</Text>
          <View style={styles.futureCard}>
            <View style={styles.futureIcon}><Text style={styles.futureIconText}>▦</Text></View>
            <View style={styles.futureCopy}>
              <Text style={styles.futureTitle}>QR Badge</Text>
              <Text style={styles.futureDescription}>
                Your event check-in badge will appear here.
              </Text>
            </View>
            <Text style={styles.comingSoon}>COMING SOON</Text>
          </View>

          <View style={[styles.futureCard, styles.scheduleCard]}>
            <View style={styles.futureIcon}><Text style={styles.futureIconText}>▤</Text></View>
            <View style={styles.futureCopy}>
              <Text style={styles.futureTitle}>Upcoming schedule</Text>
              <Text style={styles.futureDescription}>
                Course, conference, and lab sessions you register for will be listed here.
              </Text>
              <View style={styles.scheduleTags}>
                <Text style={styles.scheduleTag}>Courses</Text>
                <Text style={styles.scheduleTag}>Conferences</Text>
                <Text style={styles.scheduleTag}>Labs</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* App Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Global Health Academy</Text>
            <Text style={styles.headerSubtitle}>{selectedVertical ? categoryLabels[selectedVertical] : 'Explore GHA programs and communities'}</Text>
          </View>
          <View style={styles.headerAccount}>
            <Text style={styles.headerWelcome} numberOfLines={1}>{user.name}</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => setActiveScreen('profile')}
                style={styles.profileButton}
                accessibilityRole="button"
                accessibilityLabel="Open profile"
              >
                <Text style={styles.profileButtonIcon}>👤</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={logout} style={styles.logoutButton} accessibilityRole="button" accessibilityLabel="Sign out">
                <Text style={styles.logoutIcon}>↪</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {selectedVertical === null ? (
        <ScrollView style={styles.landingFeed} contentContainerStyle={styles.landingContent}>
          {landingLinks.map((link) => {
          const contents = (
            <Image
              source={{ uri: link.uri }}
              style={styles.landingImage}
              resizeMode="contain"
              onLoad={() => setImageErrors((current) => ({ ...current, [link.name]: false }))}
              onError={(event) => {
                console.error(`[GHA-MOBILE] Failed to load ${link.name} landing image:`, event.nativeEvent.error);
                setImageErrors((current) => ({ ...current, [link.name]: true }));
              }}
            />
          );
          return (
            <TouchableOpacity
              key={link.name}
              style={styles.landingImageFrame}
              activeOpacity={0.85}
              onPress={() => openLandingLink(link.name, link.category)}
              disabled={link.name === 'GHA' && ssoLoading}
              accessibilityRole="button"
              accessibilityLabel={link.name === 'GHA' ? 'Open GHA LearnWorlds sign-in' : `View ${link.name} content`}
            >
              {contents}
              <Text style={styles.landingTileLabel}>{link.name}</Text>
              {imageErrors[link.name] && (
                <View style={styles.imageErrorOverlay}>
                  <Text style={styles.imageErrorTitle}>{link.name} image could not load</Text>
                  <Text style={styles.imageErrorText}>Check your internet connection and retry.</Text>
                </View>
              )}
              {link.name === 'GHA' && ssoLoading && (
                <View style={styles.ssoOverlay}>
                  <ActivityIndicator size="large" color="#ffffff" />
                  <Text style={styles.ssoOverlayText}>Connecting to LearnWorlds…</Text>
                </View>
              )}
            </TouchableOpacity>
          );
          })}
        </ScrollView>
      ) : (
        <ScrollView style={styles.eventFeed} contentContainerStyle={styles.eventFeedContent}>
          <TouchableOpacity style={styles.contentBackButton} onPress={returnToLanding} accessibilityRole="button" accessibilityLabel="Back to app grid">
            <Text style={styles.contentBackText}>‹  All apps</Text>
          </TouchableOpacity>
          <Text style={styles.contentPageTitle}>{selectedLandingTitle}</Text>
          {sectionsLoading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color="#0f172a" />
              <Text style={styles.loadingText}>Loading published content…</Text>
            </View>
          ) : sectionsError ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Updates coming soon</Text>
              <Text style={styles.emptyDescription}>Do we visit shortly for new updates</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => setSectionsRetry((value) => value + 1)}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : publishedSections.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Updates coming soon</Text>
              <Text style={styles.emptyDescription}>Do we visit shortly for new updates</Text>
            </View>
          ) : publishedSections.map((section) => {
            const images = section.images?.length
              ? section.images
              : [{ blobPath: section.imageBlobPath, title: section.title, description: section.description, url: section.url, fileName: 'banner.jpg', mimeType: 'image/jpeg', sizeBytes: 0 }];

            return (
              <View key={section.id}>
                {images.map((sectionImage, index) => {
                  const imageUrl = sectionImage.url?.trim() || sectionImage.previewUrl?.trim() || section.url?.trim();
                  const title = sectionImage.title?.trim() || section.title;
                  const description = sectionImage.description?.trim() || section.description;
                  const image = (
                    <Image
                      source={{ uri: eventGateway.resolveBlobImageUrl(sectionImage.blobPath) }}
                      style={styles.eventCardImage}
                      resizeMode="cover"
                      onError={(event) => console.error(`[GHA-MOBILE] Failed to load published ${section.category} image:`, event.nativeEvent.error)}
                    />
                  );
                  return (
                    <View key={`${section.id}-image-${index}`} style={styles.eventCard}>
                      {imageUrl ? (
                        <TouchableOpacity activeOpacity={0.9} onPress={() => handleImagePressRedirect(imageUrl)}>
                          {image}
                        </TouchableOpacity>
                      ) : image}
                      <View style={styles.eventCardBody}>
                        <Text style={styles.eventMeta}>{section.eventYear} · {section.category === 'AHS' ? 'Course / AHS' : section.category}</Text>
                        <Text style={styles.eventTitle}>{title}</Text>
                        <Text style={styles.eventDescription}>{description}</Text>
                        {imageUrl ? (
                          <TouchableOpacity onPress={() => handleImagePressRedirect(imageUrl)} style={styles.eventLink}>
                            <Text style={styles.eventLinkText} numberOfLines={1}>{imageUrl}</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      )}

    </SafeAreaView>
  );
}

function ProfileDetail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { backgroundColor: '#0f172a', paddingHorizontal: 20, paddingVertical: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCopy: { flex: 1, paddingRight: 10 },
  headerAccount: { alignItems: 'center', justifyContent: 'center', gap: 4, maxWidth: 160 },
  headerActions: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  headerWelcome: { color: '#f8fafc', fontSize: 16, fontWeight: '700', maxWidth: 160 },
  headerSubtitle: { color: '#cbd5e1', fontSize: 12, marginTop: 2 },
  profileButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#64748b' },
  profileButtonIcon: { color: '#f8fafc', fontSize: 22, fontWeight: '700' },
  logoutButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, borderWidth: 1, borderColor: '#64748b' },
  logoutIcon: { color: '#f8fafc', fontSize: 24, fontWeight: '700', transform: [{ scaleX: -1 }] },
  profileHeader: { minHeight: 64, backgroundColor: '#0f172a', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { minWidth: 88, flexDirection: 'row', alignItems: 'center' },
  backButtonText: { color: '#ffffff', fontSize: 34, lineHeight: 38, marginRight: 3 },
  backButtonLabel: { color: '#cbd5e1', fontSize: 13, fontWeight: '600' },
  profileHeaderTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  profileScroll: { flex: 1 },
  landingFeed: { flex: 1 },
  eventFeed: { flex: 1 },
  eventFeedContent: { padding: 14, paddingBottom: 24 },
  landingContent: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 20, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  landingImageFrame: { width: '48%', height: 148, overflow: 'hidden', borderRadius: 12, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 10 },
  landingImage: { position: 'absolute', top: 6, left: 4, right: 4, width: '95%', height: 106 },
  landingTileLabel: { color: '#0f172a', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  imageErrorOverlay: { ...StyleSheet.absoluteFill, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', padding: 16 },
  imageErrorTitle: { color: '#991b1b', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  imageErrorText: { color: '#475569', fontSize: 12, marginTop: 5, textAlign: 'center' },
  contentBackButton: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 12, marginBottom: 10 },
  contentBackText: { color: '#0369a1', fontSize: 14, fontWeight: '700' },
  contentPageTitle: { color: '#0f172a', fontSize: 22, fontWeight: '800', marginBottom: 12 },
  loadingText: { color: '#475569', fontSize: 13, marginTop: 10 },
  emptyState: { flex: 1, minHeight: 180, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyTitle: { color: '#0f172a', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyDescription: { color: '#64748b', fontSize: 13, lineHeight: 19, marginTop: 7, textAlign: 'center' },
  errorText: { color: '#991b1b', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  retryButton: { backgroundColor: '#0f172a', borderRadius: 8, paddingHorizontal: 18, paddingVertical: 9, marginTop: 14 },
  retryButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  eventCard: { backgroundColor: '#ffffff', borderRadius: 14, overflow: 'hidden', marginBottom: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  eventCardImage: { width: '100%', height: 190, backgroundColor: '#e2e8f0' },
  eventCardBody: { padding: 14 },
  eventMeta: { color: '#475569', fontSize: 11, fontWeight: '700', marginBottom: 5 },
  eventTitle: { color: '#0f172a', fontSize: 16, lineHeight: 22, fontWeight: '800', marginBottom: 7 },
  eventDescription: { color: '#475569', fontSize: 13, lineHeight: 19 },
  eventLink: { marginTop: 9, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  eventLinkText: { color: '#0369a1', fontSize: 11 },
  ssoOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15, 23, 42, 0.72)', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ssoOverlayText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  profileContent: { padding: 18, paddingBottom: 32 },
  registrationContent: { padding: 18, paddingBottom: 32 },
  registrationIntro: { color: '#475569', fontSize: 14, lineHeight: 21, marginBottom: 14 },
  registrationEmptyCard: { alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 22, marginTop: 8 },
  registrationEmptyIcon: { width: 54, height: 54, borderRadius: 16, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  registrationEmptyIconText: { color: '#2563eb', fontSize: 26, fontWeight: '700' },
  registrationEmptyTitle: { color: '#0f172a', fontSize: 16, fontWeight: '800' },
  registrationMessage: { color: '#64748b', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 7 },
  registerEntry: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#0f172a', borderRadius: 14, padding: 15, marginBottom: 22 },
  registerEntryIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center' },
  registerEntryIconText: { color: '#ffffff', fontSize: 26, lineHeight: 30 },
  registerEntryCopy: { flex: 1 },
  registerEntryTitle: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  registerEntryDescription: { color: '#cbd5e1', fontSize: 12, marginTop: 4 },
  registerEntryArrow: { color: '#ffffff', fontSize: 28, lineHeight: 32 },
  identityCard: { alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', padding: 24, marginBottom: 22 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { color: '#1d4ed8', fontSize: 23, fontWeight: '800' },
  profileName: { color: '#0f172a', fontSize: 21, fontWeight: '800', textAlign: 'center' },
  profileSubheading: { color: '#64748b', fontSize: 13, marginTop: 4 },
  profileSectionTitle: { color: '#0f172a', fontSize: 16, fontWeight: '800', marginBottom: 10 },
  detailsCard: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 15, marginBottom: 22 },
  detailRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  detailLabel: { color: '#64748b', fontSize: 13 },
  detailValue: { color: '#0f172a', fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  detailDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e2e8f0' },
  futureCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 15, marginBottom: 12 },
  futureIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
  futureIconText: { color: '#2563eb', fontSize: 22, fontWeight: '700' },
  futureCopy: { flex: 1 },
  futureTitle: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
  futureDescription: { color: '#64748b', fontSize: 13, lineHeight: 19, marginTop: 4 },
  comingSoon: { color: '#64748b', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  scheduleCard: { marginBottom: 0 },
  scheduleTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  scheduleTag: { color: '#1d4ed8', backgroundColor: '#eff6ff', borderRadius: 12, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: '700' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
