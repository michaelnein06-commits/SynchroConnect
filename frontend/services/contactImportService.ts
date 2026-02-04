import * as Contacts from 'expo-contacts';
import * as FileSystem from 'expo-file-system';
import { Platform, Alert, Linking } from 'react-native';

export interface ImportedContact {
  name: string;
  phoneNumbers?: string[];
  emails?: string[];
  company?: string;
  jobTitle?: string;
  birthday?: string;       // ISO format YYYY-MM-DD
  birthdayRaw?: {          // Raw birthday object for debugging
    year?: number;
    month?: number;
    day?: number;
  };
  image?: any;
  imageBase64?: string;    // Base64 encoded image
  id?: string;
  note?: string;
  location?: string;       // Address/location
  addresses?: string[];    // All addresses
}

// Helper to format birthday from expo-contacts format
function formatBirthday(birthday?: { year?: number; month?: number; day?: number }): string {
  if (!birthday) return '';
  
  // expo-contacts uses 0-indexed months (January = 0)
  const year = birthday.year || 2000;  // Default year if not provided
  const month = (birthday.month !== undefined ? birthday.month : 0) + 1; // Convert to 1-indexed
  const day = birthday.day || 1;
  
  // Return ISO format YYYY-MM-DD
  const monthStr = month.toString().padStart(2, '0');
  const dayStr = day.toString().padStart(2, '0');
  
  return `${year}-${monthStr}-${dayStr}`;
}

export async function requestContactsPermission(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Contacts.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Contacts.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (error) {
    console.error('Error requesting contacts permission:', error);
    return false;
  }
}

/**
 * Check if we have full contact access or limited (iOS 18+)
 */
export async function checkContactAccessLevel(): Promise<'full' | 'limited' | 'denied'> {
  try {
    const { status } = await Contacts.getPermissionsAsync();
    
    if (status !== 'granted') {
      return 'denied';
    }
    
    // Try to get contacts to check if we have full access
    const result = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name],
      pageSize: 1000,
    });
    
    // If we get very few contacts compared to what user expects, it's likely limited
    return result.data.length > 0 ? 'full' : 'limited';
  } catch (error) {
    return 'denied';
  }
}

/**
 * Show alert to guide user to grant full contact access
 */
export function showFullAccessAlert() {
  Alert.alert(
    'Limited Contact Access',
    'You\'ve only granted access to some contacts. To import all your contacts:\n\n1. Go to Settings\n2. Find this app\n3. Tap "Contacts"\n4. Select "Full Access"',
    [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Open Settings', 
        onPress: () => Linking.openSettings() 
      },
    ]
  );
}

export async function importPhoneContacts(): Promise<ImportedContact[]> {
  try {
    // Check platform - contacts not available on web
    if (Platform.OS === 'web') {
      console.log('Contacts not available on web');
      return [];
    }

    // Request permission first
    console.log('Requesting contacts permission...');
    const { status: existingStatus } = await Contacts.getPermissionsAsync();
    console.log('Current permission status:', existingStatus);
    
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      console.log('Requesting new permission...');
      const { status } = await Contacts.requestPermissionsAsync();
      finalStatus = status;
      console.log('New permission status:', finalStatus);
    }
    
    if (finalStatus !== 'granted') {
      // Show alert to user
      Alert.alert(
        'Permission Required',
        'Please grant contact access in Settings to import contacts.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      throw new Error('Contacts permission not granted');
    }

    console.log('Starting contact import...');
    
    let allContacts: Contacts.Contact[] = [];
    
    // Method 1: Simple direct fetch with all fields including addresses and images
    try {
      console.log('Fetching contacts directly...');
      const result = await Contacts.getContactsAsync({
        fields: [
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
          Contacts.Fields.RawImage,
          Contacts.Fields.ID,
          Contacts.Fields.Note,
          Contacts.Fields.Addresses,  // Include addresses
        ],
        pageSize: 10000,
        pageOffset: 0,
      });
      
      console.log('Direct fetch result:', result ? `total=${result.total}, data=${result.data?.length}` : 'null');
      
      if (result && result.data && result.data.length > 0) {
        allContacts = result.data;
        console.log(`Direct method: Got ${allContacts.length} contacts`);
      }
    } catch (directError) {
      console.log('Direct fetch error:', directError);
    }
    
    // Method 2: Try containers if direct method failed
    if (allContacts.length === 0) {
      try {
        const containers = await Contacts.getContainersAsync({});
        console.log(`Found ${containers.length} contact containers`);
        
        if (containers.length > 0) {
          for (const container of containers) {
            try {
              const containerContacts = await Contacts.getContactsAsync({
                containerId: container.id,
                fields: [
                  Contacts.Fields.Name,
                  Contacts.Fields.FirstName,
                  Contacts.Fields.LastName,
                  Contacts.Fields.PhoneNumbers,
                  Contacts.Fields.Emails,
                  Contacts.Fields.Image,
                  Contacts.Fields.RawImage,
                  Contacts.Fields.ID,
                  Contacts.Fields.Addresses,
                  Contacts.Fields.Note,
                  Contacts.Fields.Birthday,
                ],
                pageSize: 10000,
                pageOffset: 0,
              });
              
              if (containerContacts && containerContacts.data) {
                console.log(`Container ${container.name || container.id}: ${containerContacts.data.length} contacts`);
                allContacts = [...allContacts, ...containerContacts.data];
              }
            } catch (containerError) {
              console.log(`Error reading container ${container.id}:`, containerError);
            }
          }
        }
      } catch (containerError) {
        console.log('Container method failed:', containerError);
      }
    }
    
    // Method 2: If container method didn't work or returned few contacts, try default method
    if (allContacts.length < 10) {
      console.log('Trying default contact fetch method...');
      
      try {
        const result = await Contacts.getContactsAsync({
          fields: [
            Contacts.Fields.Name,
            Contacts.Fields.FirstName,
            Contacts.Fields.LastName,
            Contacts.Fields.PhoneNumbers,
            Contacts.Fields.Emails,
            Contacts.Fields.Company,
            Contacts.Fields.JobTitle,
            Contacts.Fields.Birthday,
            Contacts.Fields.Image,
            Contacts.Fields.RawImage,
            Contacts.Fields.ID,
            Contacts.Fields.Note,
            Contacts.Fields.Addresses,
          ],
          pageSize: 10000,
          pageOffset: 0,
        });

        if (result && result.data && result.data.length > 0) {
          console.log(`Default method: Total available: ${result.total}, Retrieved: ${result.data.length}`);
          allContacts = result.data;
        } else {
          console.log('Default method returned no data, trying with all fields again...');
          // Try again with all fields but without pageOffset
          const allFieldsResult = await Contacts.getContactsAsync({
            fields: [
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
              Contacts.Fields.RawImage,
              Contacts.Fields.ID,
              Contacts.Fields.Note,
              Contacts.Fields.Addresses,
            ],
          });
          
          if (allFieldsResult && allFieldsResult.data && allFieldsResult.data.length > 0) {
            console.log(`All fields method: Retrieved ${allFieldsResult.data.length} contacts`);
            allContacts = allFieldsResult.data;
          } else {
            console.log('All fields method returned no data, trying minimal fields...');
            // Last resort - minimal fields
            const minimalResult = await Contacts.getContactsAsync({
              fields: [
                Contacts.Fields.Name,
                Contacts.Fields.PhoneNumbers,
                Contacts.Fields.Emails,
              ],
            });
            
            if (minimalResult && minimalResult.data && minimalResult.data.length > 0) {
              console.log(`Minimal method: Retrieved ${minimalResult.data.length} contacts`);
              console.log('WARNING: Only basic fields available - birthdays, images, notes, addresses may be missing!');
              allContacts = minimalResult.data;
            }
          }
        }
      } catch (fetchError) {
        console.log('Error fetching contacts:', fetchError);
      }
    }

    // If we still don't have contacts with all fields, try fetching additional data for each contact
    if (allContacts.length > 0 && !allContacts[0].birthday && !allContacts[0].image) {
      console.log('Attempting to fetch additional fields for each contact...');
      const enrichedContacts: Contacts.Contact[] = [];
      
      // Only process first 100 to avoid timeout
      const contactsToEnrich = allContacts.slice(0, 100);
      
      for (const contact of contactsToEnrich) {
        if (contact.id) {
          try {
            const fullContact = await Contacts.getContactByIdAsync(contact.id, [
              Contacts.Fields.Name,
              Contacts.Fields.FirstName,
              Contacts.Fields.LastName,
              Contacts.Fields.PhoneNumbers,
              Contacts.Fields.Emails,
              Contacts.Fields.Company,
              Contacts.Fields.JobTitle,
              Contacts.Fields.Birthday,
              Contacts.Fields.Image,
              Contacts.Fields.RawImage,
              Contacts.Fields.Note,
              Contacts.Fields.Addresses,
            ]);
            if (fullContact) {
              enrichedContacts.push(fullContact);
            } else {
              enrichedContacts.push(contact);
            }
          } catch (e) {
            enrichedContacts.push(contact);
          }
        } else {
          enrichedContacts.push(contact);
        }
      }
      
      // Add remaining contacts (not enriched)
      enrichedContacts.push(...allContacts.slice(100));
      allContacts = enrichedContacts;
      console.log(`Enriched ${Math.min(100, contactsToEnrich.length)} contacts with additional fields`);
    }

    // Log warning if we got very few contacts
    if (allContacts.length < 20) {
      console.log('WARNING: Only got ' + allContacts.length + ' contacts. User may have limited access enabled.');
    }

    // Remove duplicates by ID
    const uniqueContactsMap = new Map<string, Contacts.Contact>();
    for (const contact of allContacts) {
      const contactName = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
      
      if (contact.id && contactName) {
        uniqueContactsMap.set(contact.id, contact);
      } else if (contactName) {
        // For contacts without ID, use name as key
        const key = contactName.toLowerCase();
        if (!uniqueContactsMap.has(key)) {
          uniqueContactsMap.set(key, contact);
        }
      }
    }
    
    const uniqueContacts = Array.from(uniqueContactsMap.values());
    console.log(`Total unique contacts after deduplication: ${uniqueContacts.length}`);

    // Process contacts and convert images to base64
    const importedContacts: ImportedContact[] = [];
    let contactsWithBirthdays = 0;
    let contactsWithImages = 0;
    let contactsWithNotes = 0;
    let contactsWithAddresses = 0;
    
    for (const contact of uniqueContacts) {
      const name = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
      if (!name || name.length === 0) continue;
      
      // Extract address/location
      let location: string | undefined;
      let addresses: string[] = [];
      if (contact.addresses && contact.addresses.length > 0) {
        addresses = contact.addresses.map(addr => {
          const parts = [
            addr.street,
            addr.city,
            addr.region,
            addr.postalCode,
            addr.country
          ].filter(Boolean);
          return parts.join(', ');
        }).filter(a => a.length > 0);
        location = addresses[0]; // Use first address as primary location
        if (location) contactsWithAddresses++;
      }
      
      // Convert image to base64 if available
      let imageBase64: string | undefined;
      if (contact.image?.uri || contact.rawImage?.uri) {
        try {
          const imageUri = contact.image?.uri || contact.rawImage?.uri;
          if (imageUri) {
            // Read the image and convert to base64
            const base64 = await FileSystem.readAsStringAsync(imageUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            // Determine mime type (assume jpeg for contacts)
            imageBase64 = `data:image/jpeg;base64,${base64}`;
            contactsWithImages++;
          }
        } catch (imgError) {
          // Silent fail for image conversion
        }
      }
      
      // Parse birthday correctly
      // expo-contacts birthday: { year?, month (0-11), day }
      let birthdayFormatted: string | undefined;
      let birthdayRaw: { year?: number; month?: number; day?: number } | undefined;
      
      if (contact.birthday) {
        birthdayRaw = {
          year: contact.birthday.year,
          month: contact.birthday.month,
          day: contact.birthday.day
        };
        birthdayFormatted = formatBirthday(contact.birthday);
        if (birthdayFormatted) contactsWithBirthdays++;
        console.log(`Birthday for ${name}: raw=${JSON.stringify(contact.birthday)}, formatted=${birthdayFormatted}`);
      }
      
      // Track notes
      if (contact.note) contactsWithNotes++;
      
      importedContacts.push({
        name: name || 'Unknown',
        phoneNumbers: contact.phoneNumbers?.map((p) => p.number || '').filter(n => n) || [],
        emails: contact.emails?.map((e) => e.email || '').filter(e => e) || [],
        company: contact.company,
        jobTitle: contact.jobTitle,
        birthday: birthdayFormatted,
        birthdayRaw,
        image: contact.image,
        imageBase64,
        id: contact.id,
        note: contact.note,
        location,
        addresses,
      });
    }

    console.log(`=== IMPORT STATS ===`);
    console.log(`Total imported: ${importedContacts.length}`);
    console.log(`With birthdays: ${contactsWithBirthdays}`);
    console.log(`With images: ${contactsWithImages}`);
    console.log(`With notes: ${contactsWithNotes}`);
    console.log(`With addresses: ${contactsWithAddresses}`);
    console.log(`====================`);
    
    return importedContacts;
  } catch (error) {
    console.error('Error importing contacts:', error);
    throw error;
  }
}

export function formatContactForCRM(importedContact: ImportedContact) {
  return {
    name: importedContact.name,
    job: importedContact.jobTitle || importedContact.company || '',
    phone: importedContact.phoneNumbers && importedContact.phoneNumbers.length > 0 ? importedContact.phoneNumbers[0] : '',
    email: importedContact.emails && importedContact.emails.length > 0 ? importedContact.emails[0] : '',
    birthday: importedContact.birthday || '',
    // Use base64 image if available, otherwise use URI (which might not work)
    profile_picture: importedContact.imageBase64 || importedContact.image?.uri || '',
    device_contact_id: importedContact.id || '',
    tags: [],
    groups: [],
    pipeline_stage: 'New',  // Imported contacts go to "New" stage
    language: 'English',
    tone: 'Casual',
    notes: importedContact.note || '',  // Use the note from iPhone if available
    location: importedContact.location || '',  // Use the address from iPhone
  };
}
