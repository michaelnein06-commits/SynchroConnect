import * as Contacts from 'expo-contacts';
import * as FileSystem from 'expo-file-system';
import { Platform, Alert, Linking } from 'react-native';

export interface ImportedContact {
  name: string;
  phoneNumbers?: string[];
  emails?: string[];
  company?: string;
  jobTitle?: string;
  birthday?: string;
  birthdayRaw?: {
    year?: number;
    month?: number;
    day?: number;
  };
  image?: any;
  imageBase64?: string;
  id?: string;
  note?: string;
  location?: string;
  addresses?: string[];
}

// Helper to format birthday - handles both string and number values
function formatBirthday(birthday?: { year?: number | string; month?: number | string; day?: number | string }): string {
  if (!birthday) return '';
  
  // Convert to numbers (expo-contacts can return strings or numbers)
  const year = typeof birthday.year === 'string' ? parseInt(birthday.year) : (birthday.year || 2000);
  // expo-contacts month is 0-indexed on iOS
  const monthRaw = typeof birthday.month === 'string' ? parseInt(birthday.month) : birthday.month;
  const month = monthRaw !== undefined ? monthRaw + 1 : 1; // Convert to 1-indexed
  const day = typeof birthday.day === 'string' ? parseInt(birthday.day) : (birthday.day || 1);
  
  if (isNaN(month) || isNaN(day)) return '';
  
  const monthStr = month.toString().padStart(2, '0');
  const dayStr = day.toString().padStart(2, '0');
  
  return `${year}-${monthStr}-${dayStr}`;
}

export async function requestContactsPermission(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Contacts.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Accept both 'granted' AND 'limited' as valid permissions (iOS 18+)
    if (existingStatus !== 'granted' && existingStatus !== 'limited') {
      const { status } = await Contacts.requestPermissionsAsync();
      finalStatus = status;
    }

    // Both 'granted' and 'limited' allow contact access
    return finalStatus === 'granted' || finalStatus === 'limited';
  } catch (error) {
    console.error('Error requesting contacts permission:', error);
    return false;
  }
}

// Check if we have full access or limited access
export async function getContactAccessLevel(): Promise<'full' | 'limited' | 'denied'> {
  try {
    const { status } = await Contacts.getPermissionsAsync();
    if (status === 'granted') return 'full';
    if (status === 'limited') return 'limited';
    return 'denied';
  } catch (error) {
    return 'denied';
  }
}

export async function importPhoneContacts(): Promise<ImportedContact[]> {
  try {
    if (Platform.OS === 'web') {
      console.log('Contacts not available on web');
      return [];
    }

    console.log('=== CONTACT IMPORT v2.0 (iOS 18+ Support) ===');
    
    // Request permission - accept both 'granted' and 'limited'
    const { status } = await Contacts.getPermissionsAsync();
    console.log('Current permission status:', status);
    
    // iOS 18+ can return 'limited' which is still valid!
    const hasAccess = status === 'granted' || status === 'limited';
    const isLimitedAccess = status === 'limited';
    
    if (!hasAccess) {
      console.log('No access, requesting permission...');
      const { status: newStatus } = await Contacts.requestPermissionsAsync();
      console.log('New permission status:', newStatus);
      
      if (newStatus !== 'granted' && newStatus !== 'limited') {
        Alert.alert(
          'Berechtigung erforderlich', 
          'Bitte erlaube Zugriff auf Kontakte in den Einstellungen.',
          [
            { text: 'Abbrechen' },
            { text: 'Einstellungen öffnen', onPress: () => Linking.openSettings() }
          ]
        );
        return [];
      }
    }
    
    // Log access type for debugging
    console.log('Access type:', isLimitedAccess ? 'LIMITED (iOS 18+)' : 'FULL');

    // Define ALL the fields we want to request
    const requestedFields = [
      Contacts.Fields.ID,
      Contacts.Fields.Name,
      Contacts.Fields.FirstName,
      Contacts.Fields.LastName,
      Contacts.Fields.PhoneNumbers,
      Contacts.Fields.Emails,
      Contacts.Fields.Company,
      Contacts.Fields.JobTitle,
      Contacts.Fields.Birthday,
      Contacts.Fields.Image,
      Contacts.Fields.ImageAvailable,
      Contacts.Fields.Note,
      Contacts.Fields.Addresses,
    ].filter(Boolean); // Filter out any undefined fields

    console.log('Requesting fields:', requestedFields.length);

    // STEP 1: Try to get all contacts with all fields at once
    console.log('Step 1: Fetching contacts with extended fields...');
    
    let allContacts: Contacts.Contact[] = [];
    
    try {
      const result = await Contacts.getContactsAsync({
        fields: requestedFields,
        pageSize: 10000,
      });
      
      console.log('Initial fetch result:', result?.data?.length || 0, 'contacts');
      
      if (result?.data) {
        allContacts = result.data;
      }
    } catch (e: any) {
      console.log('Bulk fetch failed:', e?.message);
      
      // Fallback: Try without fields specification
      try {
        console.log('Trying fallback fetch without field specification...');
        const fallbackResult = await Contacts.getContactsAsync({
          pageSize: 10000,
        });
        if (fallbackResult?.data) {
          allContacts = fallbackResult.data;
          console.log('Fallback fetch got:', allContacts.length, 'contacts');
        }
      } catch (e2: any) {
        console.log('Fallback also failed:', e2?.message);
        return [];
      }
    }
    
    if (allContacts.length === 0) {
      console.log('No contacts found');
      return [];
    }

    // STEP 2: For LIMITED access on iOS 18+, we need to enrich contacts individually
    // because the bulk fetch might not return extended fields
    console.log('Step 2: Processing', allContacts.length, 'contacts...');
    
    const importedContacts: ImportedContact[] = [];
    let stats = { birthdays: 0, images: 0, notes: 0, addresses: 0, enriched: 0 };
    
    // Check if bulk fetch returned extended data
    const bulkHasExtendedData = allContacts.some(c => 
      c.birthday || c.note || c.image?.uri || (c.addresses && c.addresses.length > 0)
    );
    console.log('Bulk fetch has extended data:', bulkHasExtendedData);

    for (let i = 0; i < allContacts.length; i++) {
      let contact = allContacts[i];
      
      // If bulk didn't have extended data AND we have limited access,
      // try to fetch individually (might work for user-selected contacts)
      if (!bulkHasExtendedData && contact.id) {
        try {
          const enrichedContact = await Contacts.getContactByIdAsync(contact.id, requestedFields);
          if (enrichedContact) {
            contact = enrichedContact;
            stats.enriched++;
          }
        } catch (e) {
          // Keep using the original contact data
        }
      }
      
      const name = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
      if (!name) continue;

      // Birthday processing
      let birthdayFormatted: string | undefined;
      let birthdayRaw: { year?: number; month?: number; day?: number } | undefined;
      
      if (contact.birthday) {
        birthdayRaw = {
          year: contact.birthday.year,
          month: contact.birthday.month,
          day: contact.birthday.day,
        };
        birthdayFormatted = formatBirthday(contact.birthday);
        if (birthdayFormatted) {
          stats.birthdays++;
          if (stats.birthdays <= 5) {
            console.log(`✅ Birthday found: ${name} -> ${birthdayFormatted}`);
          }
        }
      }

      // Addresses processing
      let location: string | undefined;
      let addressStrings: string[] = [];
      if (contact.addresses && contact.addresses.length > 0) {
        addressStrings = contact.addresses.map(addr => {
          const parts = [
            addr.street,
            addr.city, 
            addr.region,
            addr.postalCode,
            addr.country
          ].filter(Boolean);
          return parts.join(', ');
        }).filter(a => a.length > 0);
        
        location = addressStrings[0];
        if (location) stats.addresses++;
      }

      // Image to base64
      let imageBase64: string | undefined;
      if (contact.image?.uri) {
        try {
          const base64 = await FileSystem.readAsStringAsync(contact.image.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          imageBase64 = `data:image/jpeg;base64,${base64}`;
          stats.images++;
          if (stats.images <= 3) {
            console.log(`✅ Image found: ${name}`);
          }
        } catch (e) {
          // Silent fail for image
        }
      }

      // Note processing
      if (contact.note) {
        stats.notes++;
        if (stats.notes <= 3) {
          console.log(`✅ Note found: ${name}`);
        }
      }

      importedContacts.push({
        name,
        phoneNumbers: contact.phoneNumbers?.map(p => p.number || '').filter(Boolean) || [],
        emails: contact.emails?.map(e => e.email || '').filter(Boolean) || [],
        company: contact.company,
        jobTitle: contact.jobTitle,
        birthday: birthdayFormatted,
        birthdayRaw,
        image: contact.image,
        imageBase64,
        id: contact.id,
        note: contact.note,
        location,
        addresses: addressStrings,
      });
      
      // Progress log every 50 contacts
      if ((i + 1) % 50 === 0) {
        console.log(`Progress: ${i + 1}/${allContacts.length}`);
      }
    }

    console.log('=== IMPORT COMPLETE ===');
    console.log('Total contacts:', importedContacts.length);
    console.log('With birthday:', stats.birthdays);
    console.log('With image:', stats.images);
    console.log('With note:', stats.notes);
    console.log('With address:', stats.addresses);
    console.log('Individually enriched:', stats.enriched);

    // Show helpful alert if no extended data was found
    if (stats.birthdays === 0 && stats.images === 0 && importedContacts.length > 5) {
      // Check if we're on iOS 18+
      const isIOS = Platform.OS === 'ios';
      
      if (isIOS && isLimitedAccess) {
        Alert.alert(
          'Eingeschränkter Zugriff (iOS 18+)',
          'Du hast "Eingeschränkten Zugriff" gewählt. Für Geburtstage und Bilder:\n\n' +
          '1. Gehe zu Einstellungen → Datenschutz → Kontakte\n' +
          '2. Tippe auf "Expo Go"\n' +
          '3. Wähle "Voller Zugriff"\n' +
          '4. Importiere die Kontakte erneut',
          [
            { text: 'Später' },
            { text: 'Einstellungen', onPress: () => Linking.openSettings() },
          ]
        );
      } else if (isIOS) {
        Alert.alert(
          'Erweiterte Daten nicht gefunden',
          'Geburtstage und Bilder wurden nicht gefunden.\n\n' +
          'Mögliche Lösungen:\n' +
          '• Prüfe, ob deine Kontakte Geburtstage haben\n' +
          '• Gehe zu Einstellungen → Datenschutz → Kontakte\n' +
          '• Stelle sicher, dass "Voller Zugriff" aktiviert ist\n' +
          '• Starte die App neu und versuche es erneut',
          [
            { text: 'OK' },
            { text: 'Einstellungen', onPress: () => Linking.openSettings() },
          ]
        );
      }
    }

    return importedContacts;
  } catch (error: any) {
    console.error('Import error:', error?.message || error);
    throw error;
  }
}

export function formatContactForCRM(importedContact: ImportedContact) {
  return {
    name: importedContact.name,
    job: importedContact.jobTitle || importedContact.company || '',
    phone: importedContact.phoneNumbers?.[0] || '',
    email: importedContact.emails?.[0] || '',
    birthday: importedContact.birthday || '',
    profile_picture: importedContact.imageBase64 || '',
    device_contact_id: importedContact.id || '',
    tags: [],
    groups: [],
    pipeline_stage: 'New',
    language: 'English',
    tone: 'Casual',
    notes: importedContact.note || '',
    location: importedContact.location || '',
  };
}
