import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';

const EXPO_PUBLIC_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const COLORS = {
  primary: '#6366F1',
  background: '#F1F5F9',
  surface: '#FFFFFF',
  text: '#0F172A',
  textLight: '#64748B',
  success: '#10B981',
  error: '#F43F5E',
};

export default function GoogleCallback() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { token, loginWithGoogle } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing Google sign-in...');

  useEffect(() => {
    handleGoogleCallback();
  }, []);

  const handleGoogleCallback = async () => {
    try {
      // Get session_id from URL params or hash
      let sessionId = params.session_id as string;
      
      // If not in params, try to get from URL hash (for web)
      if (!sessionId && typeof window !== 'undefined') {
        const hash = window.location.hash;
        const match = hash.match(/session_id=([^&]+)/);
        if (match) {
          sessionId = match[1];
        }
      }

      if (!sessionId) {
        throw new Error('No session ID found');
      }

      console.log('Processing session:', sessionId);

      // Check if user is already logged in (connecting account) or new login
      if (token) {
        // User is logged in - just connecting Google account
        const response = await axios.post(
          `${EXPO_PUBLIC_BACKEND_URL}/api/integrations/google/callback`,
          { session_id: sessionId },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        setStatus('success');
        setMessage(`Connected as ${response.data.email}`);
        
        setTimeout(() => {
          router.replace('/settings');
        }, 2000);
      } else {
        // User is not logged in - sign in with Google
        const response = await axios.post(
          `${EXPO_PUBLIC_BACKEND_URL}/api/auth/google`,
          { session_id: sessionId }
        );

        // Store the token and user data
        await AsyncStorage.setItem('token', response.data.access_token);
        await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
        
        if (loginWithGoogle) {
          await loginWithGoogle(response.data.access_token, response.data.user);
        }

        setStatus('success');
        setMessage(`Welcome, ${response.data.user.name}!`);
        
        setTimeout(() => {
          router.replace('/');
        }, 2000);
      }
    } catch (error: any) {
      console.error('Google callback error:', error);
      setStatus('error');
      setMessage(error.response?.data?.detail || error.message || 'Failed to process Google sign-in');
      
      setTimeout(() => {
        router.replace('/auth/login');
      }, 3000);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {status === 'loading' && (
          <>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.message}>{message}</Text>
          </>
        )}
        
        {status === 'success' && (
          <>
            <View style={styles.iconContainer}>
              <Ionicons name="checkmark-circle" size={64} color={COLORS.success} />
            </View>
            <Text style={styles.successTitle}>Success!</Text>
            <Text style={styles.message}>{message}</Text>
            <Text style={styles.hint}>Redirecting...</Text>
          </>
        )}
        
        {status === 'error' && (
          <>
            <View style={styles.iconContainer}>
              <Ionicons name="close-circle" size={64} color={COLORS.error} />
            </View>
            <Text style={styles.errorTitle}>Error</Text>
            <Text style={styles.message}>{message}</Text>
            <Text style={styles.hint}>Redirecting to login...</Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  iconContainer: {
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.success,
    marginBottom: 10,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.error,
    marginBottom: 10,
  },
  message: {
    fontSize: 16,
    color: COLORS.text,
    textAlign: 'center',
    marginTop: 16,
  },
  hint: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 20,
  },
});
