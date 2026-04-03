import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { OpenStreetMapPreview } from "../../components/OpenStreetMapPreview";
import { useI18n } from "../../lib/i18n";
import {
  toPendingReportMedia,
  type PendingReportMedia,
  uploadReportMedia
} from "../../lib/reportMediaUpload";
import {
  createReport,
  listActiveServiceAreas,
  type ServiceArea
} from "../../lib/reportsApi";

type GpsLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
};

type Position = [number, number];
type PolygonGeometry = {
  type: "Polygon";
  coordinates: Position[][];
};
type MultiPolygonGeometry = {
  type: "MultiPolygon";
  coordinates: Position[][][];
};

type Props = {
  onLogout: () => Promise<void>;
  onReportCreated: () => void;
  sharedText: string;
  sharedNonce: number;
  onSharedTextHandled: () => void;
};

const MAX_MEDIA_ITEMS = 10;

function isValidPosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

function normalizeRing(ring: Position[]) {
  if (ring.length < 2) {
    return ring;
  }

  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) {
    return ring.slice(0, ring.length - 1);
  }

  return ring;
}

function isPointOnSegment(
  pointLat: number,
  pointLng: number,
  start: Position,
  end: Position
) {
  const [startLng, startLat] = start;
  const [endLng, endLat] = end;
  const squaredLength =
    (endLng - startLng) * (endLng - startLng) +
    (endLat - startLat) * (endLat - startLat);

  if (squaredLength <= 1e-12) {
    return (
      Math.abs(pointLng - startLng) <= 1e-10 &&
      Math.abs(pointLat - startLat) <= 1e-10
    );
  }

  const cross =
    (pointLat - startLat) * (endLng - startLng) -
    (pointLng - startLng) * (endLat - startLat);

  if (Math.abs(cross) > 1e-10) {
    return false;
  }

  const dot =
    (pointLng - startLng) * (endLng - startLng) +
    (pointLat - startLat) * (endLat - startLat);

  return dot >= 0 && dot <= squaredLength;
}

function isPointInRing(latitude: number, longitude: number, ring: Position[]) {
  const normalizedRing = normalizeRing(ring);
  if (normalizedRing.length < 3) {
    return false;
  }

  let inside = false;

  for (
    let index = 0, previous = normalizedRing.length - 1;
    index < normalizedRing.length;
    previous = index, index += 1
  ) {
    const current = normalizedRing[index];
    const previousPoint = normalizedRing[previous];

    if (!isValidPosition(current) || !isValidPosition(previousPoint)) {
      continue;
    }

    if (isPointOnSegment(latitude, longitude, previousPoint, current)) {
      return true;
    }

    const [currentLng, currentLat] = current;
    const [previousLng, previousLat] = previousPoint;

    const intersects =
      (currentLat > latitude) !== (previousLat > latitude) &&
      longitude <
        ((previousLng - currentLng) * (latitude - currentLat)) /
          ((previousLat - currentLat) || Number.EPSILON) +
          currentLng;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function isPointInPolygon(latitude: number, longitude: number, rings: Position[][]) {
  if (!Array.isArray(rings) || rings.length === 0) {
    return false;
  }

  const [outerRing, ...holes] = rings;
  if (!Array.isArray(outerRing) || !isPointInRing(latitude, longitude, outerRing)) {
    return false;
  }

  return !holes.some((ring) => Array.isArray(ring) && isPointInRing(latitude, longitude, ring));
}

function doesGeoJsonContainPoint(
  geojson: unknown,
  latitude: number,
  longitude: number
) {
  if (!geojson || typeof geojson !== "object") {
    return false;
  }

  const type = (geojson as { type?: string }).type;
  const coordinates = (geojson as { coordinates?: unknown }).coordinates;

  if (type === "Polygon" && Array.isArray(coordinates)) {
    return isPointInPolygon(latitude, longitude, coordinates as Position[][]);
  }

  if (type === "MultiPolygon" && Array.isArray(coordinates)) {
    return (coordinates as Position[][][]).some((polygon) =>
      isPointInPolygon(latitude, longitude, polygon)
    );
  }

  return false;
}

export function NewReportScreen({
  onLogout,
  onReportCreated,
  sharedText,
  sharedNonce,
  onSharedTextHandled
}: Props) {
  const { t } = useI18n();
  const [location, setLocation] = useState<GpsLocation | null>(null);
  const [manualLatitude, setManualLatitude] = useState("");
  const [manualLongitude, setManualLongitude] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [isManualCoordinatesModalVisible, setIsManualCoordinatesModalVisible] =
    useState(false);
  const [selectedMedia, setSelectedMedia] = useState<PendingReportMedia[]>([]);
  const [description, setDescription] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [isPickingMedia, setIsPickingMedia] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isResolvingManualLocation, setIsResolvingManualLocation] = useState(false);
  const [serviceAreas, setServiceAreas] = useState<ServiceArea[]>([]);

  const canPublish =
    description.trim().length >= 5 &&
    location !== null &&
    selectedMedia.length > 0;

  const serviceAreaOverlays = serviceAreas.map((area) => ({
    id: area.id,
    geojson: area.geojson,
    color: "#16a34a"
  }));
  const matchedServiceAreaName =
    location && serviceAreas.length > 0
      ? serviceAreas.find((area) =>
          doesGeoJsonContainPoint(
            area.geojson,
            location.latitude,
            location.longitude
          )
        )?.name ?? null
      : null;
  const isOutsideActiveServiceAreas =
    Boolean(location) &&
    serviceAreas.length > 0 &&
    matchedServiceAreaName === null;
  const selectedLocationMarkerColor = isOutsideActiveServiceAreas
    ? "#dc2626"
    : (serviceAreas.length > 0 ? "#16a34a" : "#0b6bcb");

  function setManualCoordinates(latitude: number, longitude: number) {
    setManualLatitude(formatCoordinate(latitude));
    setManualLongitude(formatCoordinate(longitude));
  }

  function applyParsedCoordinatesFromText(text: string) {
    const parsed = parseCoordinatesFromText(text);
    if (!parsed) {
      return false;
    }

    setManualCoordinates(parsed.latitude, parsed.longitude);
    setErrorMessage("");
    return true;
  }

  function onManualAddressChange(text: string) {
    setManualAddress(text);
    applyParsedCoordinatesFromText(text);
  }

  function onManualLatitudeChange(text: string) {
    if (applyParsedCoordinatesFromText(text)) {
      return;
    }

    if (looksLikeAddressOrUrl(text)) {
      setManualAddress(text);
      setManualLatitude("");
      return;
    }

    setManualLatitude(text);
  }

  function onManualLongitudeChange(text: string) {
    if (applyParsedCoordinatesFromText(text)) {
      return;
    }

    if (looksLikeAddressOrUrl(text)) {
      setManualAddress(text);
      setManualLongitude("");
      return;
    }

    setManualLongitude(text);
  }

  async function onUseCurrentLocation() {
    setErrorMessage("");
    setSuccessMessage("");
    setIsLocating(true);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setErrorMessage(t.reports.locationPermissionRequired);
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High
      });

      setLocation({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        accuracyMeters: current.coords.accuracy ?? undefined
      });
      setManualCoordinates(current.coords.latitude, current.coords.longitude);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t.reports.getLocationFailed
      );
    } finally {
      setIsLocating(false);
    }
  }

  async function resolveManualAddress() {
    const normalizedAddress = manualAddress.trim();
    if (!normalizedAddress) {
      setErrorMessage(t.reports.addressRequired);
      return null;
    }

    setIsResolvingManualLocation(true);
    try {
      const resolvedInput = await resolveLocationInput(normalizedAddress);

      if (resolvedInput.coordinates) {
        setManualLatitude(formatCoordinate(resolvedInput.coordinates.latitude));
        setManualLongitude(formatCoordinate(resolvedInput.coordinates.longitude));
        setErrorMessage("");
        return resolvedInput.coordinates;
      }

      const results = await Location.geocodeAsync(resolvedInput.address);
      const first = results[0];
      if (!first) {
        setErrorMessage(t.reports.addressLookupFailed);
        return null;
      }

      setManualCoordinates(first.latitude, first.longitude);
      setErrorMessage("");
      return {
        latitude: first.latitude,
        longitude: first.longitude
      };
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t.reports.addressLookupFailed
      );
      return null;
    } finally {
      setIsResolvingManualLocation(false);
    }
  }

  async function onApplyManualCoordinates() {
    setErrorMessage("");
    setSuccessMessage("");

    const latitude = Number.parseFloat(manualLatitude.replace(",", ".").trim());
    const longitude = Number.parseFloat(manualLongitude.replace(",", ".").trim());

    if (
      Number.isNaN(latitude) ||
      Number.isNaN(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      const resolvedAddress = await resolveManualAddress();
      if (!resolvedAddress) {
        setErrorMessage(t.reports.invalidManualCoordinates);
        return;
      }

      setLocation(resolvedAddress);
      setIsManualCoordinatesModalVisible(false);
      return;
    }

    setLocation({
      latitude,
      longitude
    });
    setIsManualCoordinatesModalVisible(false);
  }

  async function onPickFromLibrary() {
    setErrorMessage("");
    setSuccessMessage("");
    setIsPickingMedia(true);

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== "granted") {
        setErrorMessage(t.reports.mediaLibraryPermissionRequired);
        return;
      }

      const remainingSlots = MAX_MEDIA_ITEMS - selectedMedia.length;
      if (remainingSlots <= 0) {
        setErrorMessage(
          t.reports.mediaLimitReached.replace("{count}", String(MAX_MEDIA_ITEMS))
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        selectionLimit: remainingSlots,
        quality: 0.8,
        videoMaxDuration: 60
      });

      if (!result.canceled && result.assets.length > 0) {
        appendMedia(result.assets.map(toPendingReportMedia));
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t.reports.pickMediaFailed
      );
    } finally {
      setIsPickingMedia(false);
    }
  }

  async function onOpenCamera() {
    setErrorMessage("");
    setSuccessMessage("");
    setIsPickingMedia(true);

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== "granted") {
        setErrorMessage(t.reports.cameraPermissionRequired);
        return;
      }

      if (selectedMedia.length >= MAX_MEDIA_ITEMS) {
        setErrorMessage(
          t.reports.mediaLimitReached.replace("{count}", String(MAX_MEDIA_ITEMS))
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.8,
        videoMaxDuration: 60
      });

      if (!result.canceled && result.assets[0]) {
        appendMedia([toPendingReportMedia(result.assets[0])]);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t.reports.pickMediaFailed
      );
    } finally {
      setIsPickingMedia(false);
    }
  }

  async function onRecordVideo() {
    setErrorMessage("");
    setSuccessMessage("");
    setIsPickingMedia(true);

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== "granted") {
        setErrorMessage(t.reports.cameraPermissionRequired);
        return;
      }

      if (selectedMedia.length >= MAX_MEDIA_ITEMS) {
        setErrorMessage(
          t.reports.mediaLimitReached.replace("{count}", String(MAX_MEDIA_ITEMS))
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        quality: 0.8,
        videoMaxDuration: 60
      });

      if (!result.canceled && result.assets[0]) {
        appendMedia([toPendingReportMedia(result.assets[0])]);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t.reports.pickMediaFailed
      );
    } finally {
      setIsPickingMedia(false);
    }
  }

  function appendMedia(items: PendingReportMedia[]) {
    setSelectedMedia((current) => {
      const existingKeys = new Set(current.map((item) => `${item.uri}|${item.fileName}`));
      const deduped = items.filter(
        (item) => !existingKeys.has(`${item.uri}|${item.fileName}`)
      );

      const next = [...current, ...deduped].slice(0, MAX_MEDIA_ITEMS);
      if (current.length + deduped.length > MAX_MEDIA_ITEMS) {
        setErrorMessage(
          t.reports.mediaLimitReached.replace("{count}", String(MAX_MEDIA_ITEMS))
        );
      }

      return next;
    });
  }

  function removeMediaAt(index: number) {
    setSelectedMedia((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function onPublish() {
    if (!location || description.trim().length < 5 || selectedMedia.length === 0) {
      setErrorMessage(t.reports.publishRequirements);
      return;
    }

    if (isOutsideActiveServiceAreas) {
      setErrorMessage(t.reports.outsideServiceArea);
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    setIsPublishing(true);

    try {
      const uploadedMedia = [];
      for (const media of selectedMedia) {
        uploadedMedia.push(await uploadReportMedia(media));
      }

      const result = await createReport({
        description: description.trim(),
        location,
        media: uploadedMedia
      });

      setDescription("");
      setLocation(null);
      setManualLatitude("");
      setManualLongitude("");
      setSelectedMedia([]);
      setSuccessMessage(`${t.reports.reportCreated}: ${result.id}`);
      onReportCreated();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t.reports.publishFailed
      );
    } finally {
      setIsPublishing(false);
    }
  }

  useEffect(() => {
    async function loadServiceAreas() {
      try {
        const items = await listActiveServiceAreas();
        setServiceAreas(items);
      } catch {
        setServiceAreas([]);
      }
    }

    void loadServiceAreas();
  }, []);

  useEffect(() => {
    async function applySharedText() {
      if (!sharedText.trim()) {
        return;
      }

      setIsManualCoordinatesModalVisible(true);
      setManualAddress(sharedText);

      const resolvedInput = await resolveLocationInput(sharedText);
      if (resolvedInput.coordinates) {
        setManualCoordinates(
          resolvedInput.coordinates.latitude,
          resolvedInput.coordinates.longitude
        );
      }

      onSharedTextHandled();
    }

    void applySharedText()
  }, [onSharedTextHandled, sharedNonce, sharedText]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t.reports.newReportTitle}</Text>

      <Pressable
        style={[styles.button, styles.buttonSecondary]}
        onPress={onUseCurrentLocation}
        disabled={isLocating}
      >
        {isLocating ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.buttonSecondaryText}>
            {t.reports.useCurrentLocation}
          </Text>
        )}
      </Pressable>

      <Pressable
        style={[styles.button, styles.buttonSecondary]}
        onPress={() => setIsManualCoordinatesModalVisible(true)}
        disabled={isPublishing}
      >
        <Text style={styles.buttonSecondaryText}>
          {t.reports.manualCoordinatesTitle}
        </Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.label}>{t.reports.latitude}</Text>
        <Text style={styles.value}>
          {location ? location.latitude.toFixed(6) : "-"}
        </Text>
        <Text style={styles.label}>{t.reports.longitude}</Text>
        <Text style={styles.value}>
          {location ? location.longitude.toFixed(6) : "-"}
        </Text>
        <Text style={styles.label}>{t.reports.accuracy}</Text>
        <Text style={styles.value}>
          {location?.accuracyMeters !== undefined
            ? location.accuracyMeters.toFixed(1)
            : "-"}
        </Text>
      </View>

      <View style={styles.mapCard}>
        {serviceAreas.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>{t.reports.serviceAreaPreviewTitle}</Text>
            <OpenStreetMapPreview
              markers={[]}
              polygons={serviceAreaOverlays}
              preferPolygonBounds
              height={220}
            />
          </>
        ) : null}

        <Text style={styles.sectionTitle}>
          {t.reports.selectedLocationPreview}
        </Text>
        {location ? (
          <OpenStreetMapPreview
            markers={[
              {
                latitude: location.latitude,
                longitude: location.longitude,
                label: isOutsideActiveServiceAreas
                  ? t.reports.outsideServiceArea
                  : matchedServiceAreaName
                    ? t.reports.selectedServiceArea.replace("{name}", matchedServiceAreaName)
                    : t.reports.selectedLocationPreview,
                color: selectedLocationMarkerColor
              }
            ]}
            height={220}
          />
        ) : (
          <View style={styles.mapEmptyState}>
            <Text style={styles.helperText}>{t.reports.selectLocationForPreview}</Text>
          </View>
        )}
      </View>

      {serviceAreas.length > 0 ? (
        <>
          <Text style={styles.helperText}>{t.reports.serviceAreaHint}</Text>
          {location ? (
            <Text
              style={[
                styles.helperText,
                isOutsideActiveServiceAreas ? styles.helperErrorText : styles.helperSuccessText
              ]}
            >
              {isOutsideActiveServiceAreas
                ? t.reports.outsideServiceArea
                : t.reports.selectedServiceArea.replace(
                    "{name}",
                    matchedServiceAreaName ?? "-"
                  )}
            </Text>
          ) : null}
        </>
      ) : null}

      <Text style={styles.sectionTitle}>{t.reports.mediaSectionTitle}</Text>
      <Text style={styles.helperText}>{t.reports.mediaSelectionHint}</Text>
      <View style={styles.mediaActions}>
        <Pressable
          style={[styles.button, styles.mediaButton]}
          onPress={onOpenCamera}
          disabled={isPickingMedia || isPublishing}
        >
          {isPickingMedia ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>{t.reports.useCamera}</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.button, styles.mediaButton]}
          onPress={onRecordVideo}
          disabled={isPickingMedia || isPublishing}
        >
          {isPickingMedia ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>{t.reports.recordVideo}</Text>
          )}
        </Pressable>
      </View>
      <View style={styles.mediaActions}>
        <Pressable
          style={[styles.button, styles.buttonSecondary, styles.mediaButton]}
          onPress={onPickFromLibrary}
          disabled={isPickingMedia || isPublishing}
        >
          <Text style={styles.buttonSecondaryText}>
            {t.reports.chooseFromGallery}
          </Text>
        </Pressable>
      </View>

      {selectedMedia.length > 0 ? (
        <View style={styles.mediaPreviewCard}>
          <Text style={styles.sectionTitle}>
            {t.reports.selectedFilesCount.replace(
              "{count}",
              String(selectedMedia.length)
            )}
          </Text>

          {selectedMedia.map((media, index) => (
            <View key={`${media.uri}-${index}`} style={styles.mediaItemCard}>
              {media.mediaType === "image" ? (
                <Image source={{ uri: media.uri }} style={styles.previewImage} />
              ) : (
                <View style={styles.videoPreview}>
                  <Text style={styles.videoPreviewText}>
                    {t.reports.videoSelected}
                  </Text>
                </View>
              )}

              <Text style={styles.label}>{t.reports.selectedFile}</Text>
              <Text style={styles.value}>{media.fileName}</Text>
              <Text style={styles.label}>{t.reports.selectedType}</Text>
              <Text style={styles.value}>
                {media.mediaType === "image"
                  ? t.reports.imageLabel
                  : t.reports.videoLabel}
              </Text>
              <Text style={styles.label}>{t.reports.selectedSize}</Text>
              <Text style={styles.value}>
                {media.sizeBytes
                  ? formatBytes(media.sizeBytes)
                  : t.reports.sizeUnknown}
              </Text>

              <Pressable
                style={[styles.button, styles.buttonSecondary, styles.inlineButton]}
                onPress={() => removeMediaAt(index)}
                disabled={isPublishing}
              >
                <Text style={styles.buttonSecondaryText}>
                  {t.reports.removeMedia}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyMediaState}>
          <Text style={styles.emptyMediaText}>{t.reports.mediaRequiredHint}</Text>
        </View>
      )}

      <Text style={styles.label}>{t.reports.description}</Text>
      <Text style={styles.helperText}>{t.reports.descriptionHint}</Text>
      <TextInput
        multiline
        numberOfLines={5}
        placeholder={t.reports.descriptionPlaceholder}
        style={styles.textArea}
        value={description}
        onChangeText={setDescription}
      />

      <View style={styles.readinessCard}>
        <Text style={styles.readinessTitle}>{t.reports.readyChecklistTitle}</Text>
        <View style={styles.readinessRow}>
          <View style={styles.readinessItem}>
            <Text style={styles.readinessLabel}>{t.reports.readyLocation}</Text>
            <Text
              style={[
                styles.readinessValue,
                location ? styles.readinessValueReady : styles.readinessValueMissing
              ]}
            >
              {location ? t.reports.readyYes : t.reports.readyNo}
            </Text>
          </View>
          <View style={styles.readinessItem}>
            <Text style={styles.readinessLabel}>{t.reports.readyMedia}</Text>
            <Text
              style={[
                styles.readinessValue,
                selectedMedia.length > 0
                  ? styles.readinessValueReady
                  : styles.readinessValueMissing
              ]}
            >
              {selectedMedia.length > 0 ? t.reports.readyYes : t.reports.readyNo}
            </Text>
          </View>
          <View style={styles.readinessItem}>
            <Text style={styles.readinessLabel}>{t.reports.readyDescription}</Text>
            <Text
              style={[
                styles.readinessValue,
                description.trim().length >= 5
                  ? styles.readinessValueReady
                  : styles.readinessValueMissing
              ]}
            >
              {description.trim().length >= 5
                ? t.reports.readyYes
                : t.reports.readyNo}
            </Text>
          </View>
        </View>
      </View>

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}

      <Pressable
        style={styles.button}
        onPress={onPublish}
        disabled={isPublishing}
      >
        {isPublishing ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>{t.reports.publish}</Text>
        )}
      </Pressable>

      <Pressable
        style={[styles.button, styles.buttonSecondary]}
        onPress={() => void onLogout()}
      >
        <Text style={styles.buttonSecondaryText}>{t.common.logout}</Text>
      </Pressable>

      <Modal
        visible={isManualCoordinatesModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsManualCoordinatesModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>{t.reports.manualCoordinatesTitle}</Text>
            <Text style={styles.helperText}>{t.reports.manualCoordinatesHint}</Text>
            <Text style={styles.helperText}>{t.reports.manualCoordinatesPasteHint}</Text>

            <Text style={styles.label}>{t.reports.addressOrLink}</Text>
            <TextInput
              style={styles.input}
              value={manualAddress}
              onChangeText={onManualAddressChange}
              placeholder={t.reports.addressOrLinkPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
            />

            <Pressable
              style={[styles.button, styles.buttonSecondary, styles.inlineButton]}
              onPress={() => void resolveManualAddress()}
              disabled={isPublishing || isResolvingManualLocation}
            >
              {isResolvingManualLocation ? (
                <ActivityIndicator />
              ) : (
                <Text style={styles.buttonSecondaryText}>
                  {t.reports.findAddress}
                </Text>
              )}
            </Pressable>

            <Text style={styles.label}>{t.reports.latitude}</Text>
            <TextInput
              style={styles.input}
              value={manualLatitude}
              onChangeText={onManualLatitudeChange}
              placeholder={t.reports.latitudePlaceholder}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              autoCorrect={false}
              selectTextOnFocus
            />

            <Text style={styles.label}>{t.reports.longitude}</Text>
            <TextInput
              style={styles.input}
              value={manualLongitude}
              onChangeText={onManualLongitudeChange}
              placeholder={t.reports.longitudePlaceholder}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              autoCorrect={false}
              selectTextOnFocus
            />

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.button, styles.modalActionButton, styles.inlineButton]}
                onPress={() => void onApplyManualCoordinates()}
                disabled={isPublishing || isResolvingManualLocation}
              >
                <Text style={styles.buttonText}>{t.common.save}</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.button,
                  styles.buttonSecondary,
                  styles.modalActionButton,
                  styles.inlineButton
                ]}
                onPress={() => setIsManualCoordinatesModalVisible(false)}
                disabled={isPublishing || isResolvingManualLocation}
              >
                <Text style={styles.buttonSecondaryText}>{t.common.hide}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

function parseCoordinatesFromText(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }

  const coordinateToken = "[+-]?\\d+(?:\\.\\d+)?";
  const patterns = [
    new RegExp(`@(${coordinateToken}),\\s*(${coordinateToken})`),
    new RegExp(`q=(${coordinateToken}),\\s*(${coordinateToken})`),
    new RegExp(`ll=(${coordinateToken}),\\s*(${coordinateToken})`),
    new RegExp(`!3d(${coordinateToken})!4d(${coordinateToken})`),
    new RegExp(`(${coordinateToken})\\s*,\\s*(${coordinateToken})`),
    new RegExp(`(${coordinateToken})\\s+(${coordinateToken})`)
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) {
      continue;
    }

    const latitude = Number.parseFloat(match[1]);
    const longitude = Number.parseFloat(match[2]);

    if (areValidCoordinates(latitude, longitude)) {
      return { latitude, longitude };
    }
  }

  return null;
}

function areValidCoordinates(latitude: number, longitude: number) {
  return (
    !Number.isNaN(latitude) &&
    !Number.isNaN(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function looksLikeAddressOrUrl(text: string) {
  const normalized = text.trim();
  return (
    /https?:\/\//i.test(normalized) ||
    /[A-Za-z\u0400-\u04FF]/.test(normalized)
  );
}

async function resolveLocationInput(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return {
      address: ""
    };
  }

  const expanded = await expandMapsShortUrl(normalized);
  const normalizedExpanded = decodeRepeatedly(expanded);

  const parsedCoordinates = parseCoordinatesFromText(normalizedExpanded);
  if (parsedCoordinates) {
    return {
      address: `${parsedCoordinates.latitude}, ${parsedCoordinates.longitude}`,
      coordinates: parsedCoordinates
    };
  }

  try {
    const url = new URL(normalizedExpanded);
    const candidate =
      url.searchParams.get("q") ??
      url.searchParams.get("query") ??
      url.searchParams.get("daddr");

    if (candidate) {
      const decodedCandidate = decodeURIComponent(candidate).replace(/\+/g, " ").trim();
      const candidateCoordinates = parseCoordinatesFromText(decodedCandidate);
      if (candidateCoordinates) {
        return {
          address: `${candidateCoordinates.latitude}, ${candidateCoordinates.longitude}`,
          coordinates: candidateCoordinates
        };
      }

      return {
        address: decodedCandidate
      };
    }
  } catch {
    // Not a URL, keep the raw text.
  }

  const fallbackCoordinates = extractCoordinatesFromGoogleContent(normalizedExpanded);
  if (fallbackCoordinates) {
    return {
      address: `${fallbackCoordinates.latitude}, ${fallbackCoordinates.longitude}`,
      coordinates: fallbackCoordinates
    };
  }

  return {
    address: normalizedExpanded
  };
}

async function expandMapsShortUrl(text: string) {
  if (!/https?:\/\/maps\.app\.goo\.gl\//i.test(text.trim())) {
    return text;
  }

  try {
    const response = await fetch(text, {
      method: "GET",
      redirect: "follow"
    });

    if (response.url && !/https?:\/\/maps\.app\.goo\.gl\//i.test(response.url)) {
      return response.url;
    }

    const responseText = await response.text();
    const extractedFromHtml = extractGoogleMapsUrlFromHtml(responseText);
    if (extractedFromHtml) {
      return extractedFromHtml;
    }
  } catch {
    // Fall back to the original text; geocoding may still fail with a clear message.
  }

  return text;
}

function decodeGoogleHtmlValue(value: string) {
  return decodeRepeatedly(value.replace(/&amp;/g, "&").trim());
}

function decodeRepeatedly(value: string) {
  let current = value;

  for (let index = 0; index < 3; index += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) {
        break;
      }

      current = decoded;
    } catch {
      break;
    }
  }

  return current;
}

function extractGoogleMapsUrlFromHtml(html: string) {
  const candidates = [
    ...html.matchAll(/continue=([^"'\\s>]+)/gi),
    ...html.matchAll(/https:\/\/www\.google\.com\/maps\/(?:search|place)\/[^"'\\s<]+/gi)
  ];

  for (const candidate of candidates) {
    const rawValue = candidate[1] ?? candidate[0];
    const decoded = decodeGoogleHtmlValue(rawValue);
    if (/https:\/\/www\.google\.com\/maps\//i.test(decoded)) {
      return decoded;
    }
  }

  return "";
}

function extractCoordinatesFromGoogleContent(text: string) {
  const matches = [
    ...text.matchAll(/maps\/search\/([+-]?\d+(?:\.\d+)?),\+?([+-]?\d+(?:\.\d+)?)/gi),
    ...text.matchAll(/maps\/place\/([+-]?\d+(?:\.\d+)?),\+?([+-]?\d+(?:\.\d+)?)/gi)
  ];

  for (const match of matches) {
    const latitude = Number.parseFloat(match[1]);
    const longitude = Number.parseFloat(match[2]);
    if (areValidCoordinates(latitude, longitude)) {
      return { latitude, longitude };
    }
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: "#f5f6f8",
    flexGrow: 1
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    marginTop: 4,
    marginBottom: 10
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#d7dbe0",
    marginBottom: 12
  },
  mediaPreviewCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#d7dbe0",
    marginBottom: 12
  },
  mediaItemCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 12,
    marginTop: 10
  },
  mapCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#d7dbe0",
    marginBottom: 12
  },
  mapEmptyState: {
    minHeight: 80,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d7dbe0",
    borderStyle: "dashed",
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    padding: 12
  },
  previewImage: {
    width: "100%",
    height: 220,
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: "#dbe3ea"
  },
  videoPreview: {
    height: 140,
    borderRadius: 10,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12
  },
  videoPreviewText: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700"
  },
  mediaActions: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12
  },
  mediaButton: {
    flex: 1,
    marginBottom: 0
  },
  emptyMediaState: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d7dbe0",
    borderStyle: "dashed",
    backgroundColor: "#ffffff",
    padding: 14,
    marginBottom: 12
  },
  emptyMediaText: {
    color: "#4b5563",
    fontSize: 14
  },
  label: {
    fontSize: 13,
    color: "#4b5563",
    marginBottom: 4
  },
  helperText: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 10
  },
  helperSuccessText: {
    color: "#166534"
  },
  helperErrorText: {
    color: "#b91c1c"
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    padding: 20
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#d7dbe0"
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4
  },
  modalActionButton: {
    flex: 1
  },
  value: {
    fontSize: 16,
    color: "#111827",
    marginBottom: 8
  },
  input: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d7dbe0",
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
    color: "#111827"
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: "top",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d7dbe0",
    padding: 12,
    marginBottom: 12
  },
  readinessCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d7dbe0",
    padding: 12,
    marginBottom: 12
  },
  readinessTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 10
  },
  readinessRow: {
    flexDirection: "row",
    gap: 8
  },
  readinessItem: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0"
  },
  readinessLabel: {
    fontSize: 12,
    color: "#475569",
    marginBottom: 6,
    textAlign: "center"
  },
  readinessValue: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center"
  },
  readinessValueReady: {
    color: "#166534"
  },
  readinessValueMissing: {
    color: "#b91c1c"
  },
  button: {
    backgroundColor: "#0b6bcb",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10
  },
  buttonSecondary: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d7dbe0"
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16
  },
  buttonSecondaryText: {
    color: "#111827",
    fontWeight: "600",
    fontSize: 15
  },
  buttonDisabled: {
    opacity: 0.6
  },
  inlineButton: {
    marginBottom: 0,
    marginTop: 4
  },
  error: {
    color: "#b91c1c",
    marginBottom: 8
  },
  success: {
    color: "#166534",
    marginBottom: 8
  }
});
