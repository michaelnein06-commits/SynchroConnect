import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const EMERGENT_AUTH_URL = 'https://auth.emergentagent.com';
const { width, height } = Dimensions.get('window');

const COLORS = {
  primary: '#5D3FD3',
  primaryLight: '#7B68EE',
  primaryDark: '#4B32A8',
  accent: '#F43F5E',
  background: '#F1F5F9',
  surface: '#FFFFFF',
  text: '#0F172A',
  textLight: '#64748B',
  border: '#E2E8F0',
  google: '#FFFFFF',
};

export default function Login() {
  const router = useRouter();
  const { loginWithGoogle, user } = useAuth();
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      router.replace('/');
    }
  }, [user]);

  // Handle deep link callback
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      const url = event.url;
      if (url.includes('session_id=')) {
        const sessionId = url.split('session_id=')[1]?.split('&')[0];
        if (sessionId) {
          await handleGoogleCallback(sessionId);
        }
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Check if app was opened with a URL
    Linking.getInitialURL().then((url) => {
      if (url && url.includes('session_id=')) {
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleGoogleCallback = async (sessionId: string) => {
    setLoading(true);
    try {
      const response = await axios.post(`${EXPO_PUBLIC_BACKEND_URL}/api/auth/google`, {
        session_id: sessionId,
      });

      const { access_token, user: userData } = response.data;
      await loginWithGoogle(access_token, userData);
      router.replace('/');
    } catch (error: any) {
      console.error('Google auth error:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      // Create callback URL that will redirect back to app
      const redirectUri = Linking.createURL('auth/google-callback');
      const authUrl = `${EMERGENT_AUTH_URL}/?redirect=${encodeURIComponent(redirectUri)}`;

      // Open browser for Google auth
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (result.type === 'success' && result.url) {
        // Extract session_id from the callback URL
        const url = result.url;
        if (url.includes('session_id=')) {
          const sessionId = url.split('session_id=')[1]?.split('&')[0];
          if (sessionId) {
            await handleGoogleCallback(sessionId);
            return;
          }
        }
      }
      
      // If we didn't get a session_id, auth was cancelled or failed
      if (result.type !== 'cancel') {
        Alert.alert('Error', 'Could not complete Google sign-in');
      }
    } catch (error) {
      console.error('Google sign-in error:', error);
      Alert.alert('Error', 'Failed to start Google sign-in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={['#5D3FD3', '#7B68EE', '#9B87F5']}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          {/* Logo and Brand Section */}
          <View style={styles.heroSection}>
            <Image 
              source={require('../../assets/images/pitch-logo.png')} 
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.title}>Pitch</Text>
            <Text style={styles.subtitle}>
              Stay meaningfully connected with everyone who matters
            </Text>
          </View>

          {/* Features Card */}
          <View style={styles.featuresCard}>
            <View style={styles.featureRow}>
              <View style={styles.featureItem}>
                <View style={[styles.featureIcon, { backgroundColor: '#5D3FD3' + '20' }]}>
                  <Ionicons name="git-branch-outline" size={22} color="#5D3FD3" />
                </View>
                <Text style={styles.featureText}>Smart Pipeline</Text>
              </View>
              <View style={styles.featureItem}>
                <View style={[styles.featureIcon, { backgroundColor: '#10B981' + '20' }]}>
                  <Ionicons name="sparkles-outline" size={22} color="#10B981" />
                </View>
                <Text style={styles.featureText}>AI Drafts</Text>
              </View>
            </View>
            <View style={styles.featureRow}>
              <View style={styles.featureItem}>
                <View style={[styles.featureIcon, { backgroundColor: '#F59E0B' + '20' }]}>
                  <Ionicons name="time-outline" size={22} color="#F59E0B" />
                </View>
                <Text style={styles.featureText}>Track History</Text>
              </View>
              <View style={styles.featureItem}>
                <View style={[styles.featureIcon, { backgroundColor: '#EC4899' + '20' }]}>
                  <Ionicons name="people-outline" size={22} color="#EC4899" />
                </View>
                <Text style={styles.featureText}>Groups</Text>
              </View>
            </View>
          </View>

          {/* Auth Section */}
          <View style={styles.authSection}>
            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleSignIn}
              disabled={loading}
              activeOpacity={0.9}
            >
              {loading ? (
                <ActivityIndicator color="#5D3FD3" />
              ) : (
                <>
                  <View style={styles.googleIconWrapper}>
                    <Image 
                      source={{ uri: 'https://www.google.com/favicon.ico' }}
                      style={styles.googleIcon}
                    />
                  </View>
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.disclaimer}>
              By continuing, you agree to our Terms of Service and Privacy Policy
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 24,
    paddingTop: 40,
    paddingBottom: 40,
  },
  heroSection: {
    alignItems: 'center',
    paddingTop: 20,
  },
  logoCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoImage: {
    width: 140,
    height: 140,
    marginBottom: 16,
  },
  title: {
    fontSize: 42,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 17,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: 20,
    fontWeight: '500',
  },
  featuresCard: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 24,
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  featureRow: {
    flexDirection: 'row',
    gap: 12,
  },
  featureItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 14,
    borderRadius: 16,
    gap: 10,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
  },
  authSection: {
    gap: 16,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 18,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  googleIconWrapper: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleIcon: {
    width: 24,
    height: 24,
  },
  googleButtonText: {
    color: '#1E293B',
    fontSize: 18,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 18,
  },
});
