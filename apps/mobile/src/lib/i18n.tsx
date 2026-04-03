import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type Language = "bg" | "en";

const translations = {
  bg: {
    common: {
      show: "\u041f\u043e\u043a\u0430\u0436\u0438",
      hide: "\u0421\u043a\u0440\u0438\u0439",
      close: "\u0417\u0430\u0442\u0432\u043e\u0440\u0438",
      cancel: "\u041e\u0442\u043a\u0430\u0437",
      save: "\u0417\u0430\u043f\u0438\u0441",
      logout: "\u0418\u0437\u0445\u043e\u0434",
      bg: "\u0411\u0413",
      en: "EN",
      sourceMobile: "\u043c\u043e\u0431\u0438\u043b\u043d\u043e",
      sourceWeb: "\u0443\u0435\u0431",
      sourceChat: "\u0447\u0430\u0442"
    },
    app: {
      title: "Clean Sea",
      missingEnvTitle:
        "\u041b\u0438\u043f\u0441\u0432\u0430 \u043c\u043e\u0431\u0438\u043b\u043d\u0430 \u043a\u043e\u043d\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u044f",
      missingEnvText:
        "\u041f\u043e\u043f\u044a\u043b\u043d\u0438 EXPO_PUBLIC_SUPABASE_URL \u0438 EXPO_PUBLIC_SUPABASE_ANON_KEY \u0432 apps/mobile/.env \u0438 \u0440\u0435\u0441\u0442\u0430\u0440\u0442\u0438\u0440\u0430\u0439 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435\u0442\u043e.",
      reportsTab: "\u0421\u0438\u0433\u043d\u0430\u043b\u0438",
      initiativesTab: "\u0418\u0434\u0435\u0438",
      newReportTab: "\u041d\u043e\u0432 \u0441\u0438\u0433\u043d\u0430\u043b"
    },
    auth: {
      loginTitle: "\u0412\u0445\u043e\u0434",
      signUpTitle:
        "\u0421\u044a\u0437\u0434\u0430\u0439 \u043f\u0440\u043e\u0444\u0438\u043b",
      forgotTitle:
        "\u0417\u0430\u0431\u0440\u0430\u0432\u0435\u043d\u0430 \u043f\u0430\u0440\u043e\u043b\u0430",
      resetTitle:
        "\u0421\u043c\u044f\u043d\u0430 \u043d\u0430 \u043f\u0430\u0440\u043e\u043b\u0430",
      usernameLabel:
        "\u041f\u0440\u044f\u043a\u043e\u0440",
      emailLabel: "\u0418\u043c\u0435\u0439\u043b",
      phoneLabel: "\u0422\u0435\u043b\u0435\u0444\u043e\u043d",
      passwordLabel: "\u041f\u0430\u0440\u043e\u043b\u0430",
      confirmPasswordLabel:
        "\u041f\u043e\u0442\u0432\u044a\u0440\u0434\u0438 \u043f\u0430\u0440\u043e\u043b\u0430\u0442\u0430",
      newPasswordLabel:
        "\u041d\u043e\u0432\u0430 \u043f\u0430\u0440\u043e\u043b\u0430",
      loginButton: "\u0412\u0445\u043e\u0434",
      signUpButton: "\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f",
      googleButton:
        "\u041f\u0440\u043e\u0434\u044a\u043b\u0436\u0438 \u0441 Google",
      forgotButton:
        "\u0418\u0437\u043f\u0440\u0430\u0442\u0438 \u043b\u0438\u043d\u043a",
      resetButton:
        "\u041e\u0431\u043d\u043e\u0432\u0438 \u043f\u0430\u0440\u043e\u043b\u0430\u0442\u0430",
      backToLogin:
        "\u041e\u0431\u0440\u0430\u0442\u043d\u043e \u043a\u044a\u043c \u0432\u0445\u043e\u0434",
      forgotLink:
        "\u0417\u0430\u0431\u0440\u0430\u0432\u0435\u043d\u0430 \u043f\u0430\u0440\u043e\u043b\u0430?",
      createAccountLink:
        "\u0421\u044a\u0437\u0434\u0430\u0439 \u043f\u0440\u043e\u0444\u0438\u043b",
      emailPlaceholder:
        "\u0412\u044a\u0432\u0435\u0434\u0438 \u0438\u043c\u0435\u0439\u043b",
      usernamePlaceholder:
        "\u0412\u044a\u0432\u0435\u0434\u0438 \u043f\u0440\u044f\u043a\u043e\u0440",
      phonePlaceholder:
        "\u0412\u044a\u0432\u0435\u0434\u0438 \u0442\u0435\u043b\u0435\u0444\u043e\u043d \u0437\u0430 \u0432\u0440\u044a\u0437\u043a\u0430",
      passwordPlaceholder:
        "\u0412\u044a\u0432\u0435\u0434\u0438 \u043f\u0430\u0440\u043e\u043b\u0430",
      confirmPasswordPlaceholder:
        "\u0412\u044a\u0432\u0435\u0434\u0438 \u043e\u0442\u043d\u043e\u0432\u043e \u043f\u0430\u0440\u043e\u043b\u0430\u0442\u0430",
      newPasswordPlaceholder:
        "\u0412\u044a\u0432\u0435\u0434\u0438 \u043d\u043e\u0432\u0430 \u043f\u0430\u0440\u043e\u043b\u0430",
      emailPasswordRequired:
        "\u0418\u043c\u0435\u0439\u043b\u044a\u0442 \u0438 \u043f\u0430\u0440\u043e\u043b\u0430\u0442\u0430 \u0441\u0430 \u0437\u0430\u0434\u044a\u043b\u0436\u0438\u0442\u0435\u043b\u043d\u0438.",
      signUpRequired:
        "\u041f\u043e\u0442\u0440\u0435\u0431\u0438\u0442\u0435\u043b\u0441\u043a\u043e\u0442\u043e \u0438\u043c\u0435, \u0438\u043c\u0435\u0439\u043b\u044a\u0442 \u0438 \u043f\u0430\u0440\u043e\u043b\u0430\u0442\u0430 \u0441\u0430 \u0437\u0430\u0434\u044a\u043b\u0436\u0438\u0442\u0435\u043b\u043d\u0438.",
      emailRequired:
        "\u0418\u043c\u0435\u0439\u043b\u044a\u0442 \u0435 \u0437\u0430\u0434\u044a\u043b\u0436\u0438\u0442\u0435\u043b\u0435\u043d.",
      passwordTooShort:
        "\u041f\u0430\u0440\u043e\u043b\u0430\u0442\u0430 \u0442\u0440\u044f\u0431\u0432\u0430 \u0434\u0430 \u0435 \u043f\u043e\u043d\u0435 8 \u0441\u0438\u043c\u0432\u043e\u043b\u0430.",
      passwordsDoNotMatch:
        "\u041f\u0430\u0440\u043e\u043b\u0438\u0442\u0435 \u043d\u0435 \u0441\u044a\u0432\u043f\u0430\u0434\u0430\u0442.",
      googleCanceled:
        "Google \u0432\u0445\u043e\u0434\u044a\u0442 \u0431\u0435\u0448\u0435 \u043f\u0440\u0435\u043a\u044a\u0441\u043d\u0430\u0442.",
      signUpCheckEmail:
        "\u041f\u0440\u043e\u0444\u0438\u043b\u044a\u0442 \u0435 \u0441\u044a\u0437\u0434\u0430\u0434\u0435\u043d. \u041f\u0440\u043e\u0432\u0435\u0440\u0438 \u0438\u043c\u0435\u0439\u043b\u0430 \u0441\u0438 \u0437\u0430 \u043f\u043e\u0442\u0432\u044a\u0440\u0436\u0434\u0435\u043d\u0438\u0435.",
      resetLinkSent:
        "\u0418\u0437\u043f\u0440\u0430\u0442\u0438\u0445\u043c\u0435 \u043b\u0438\u043d\u043a \u0437\u0430 \u0441\u043c\u044f\u043d\u0430 \u043d\u0430 \u043f\u0430\u0440\u043e\u043b\u0430\u0442\u0430. \u041f\u0440\u043e\u0432\u0435\u0440\u0438 \u0438\u043c\u0435\u0439\u043b\u0430 \u0441\u0438.",
      passwordUpdated:
        "\u041f\u0430\u0440\u043e\u043b\u0430\u0442\u0430 \u0435 \u043e\u0431\u043d\u043e\u0432\u0435\u043d\u0430 \u0443\u0441\u043f\u0435\u0448\u043d\u043e."
    },
    reports: {
      listTitle: "\u0421\u0438\u0433\u043d\u0430\u043b\u0438",
      filterAll: "\u0412\u0441\u0438\u0447\u043a\u0438",
      feedTitle: "\u0422\u0435\u043a\u0443\u0449\u0438 \u0441\u0438\u0433\u043d\u0430\u043b\u0438",
      currentPositionUnavailable:
        "\u0422\u0435\u043a\u0443\u0449\u0430\u0442\u0430 \u043f\u043e\u0437\u0438\u0446\u0438\u044f \u043d\u0435 \u0435 \u043d\u0430\u043b\u0438\u0447\u043d\u0430",
      currentPosition: "\u0422\u0435\u043a\u0443\u0449\u0430 \u043f\u043e\u0437\u0438\u0446\u0438\u044f",
      mapUnavailableTitle:
        "\u041a\u0430\u0440\u0442\u0430\u0442\u0430 \u0432\u0440\u0435\u043c\u0435\u043d\u043d\u043e \u043d\u0435 \u0435 \u043d\u0430\u043b\u0438\u0447\u043d\u0430",
      mapUnavailableText:
        "\u041d\u0430\u043f\u0440\u0430\u0432\u0438 clean rebuild \u043d\u0430 Android \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435\u0442\u043e \u0441\u043b\u0435\u0434 \u043a\u0430\u0442\u043e \u0437\u0430\u0434\u0430\u0434\u0435\u0448 Google Maps API key.",
      mapNoMarkersTitle:
        "\u041d\u044f\u043c\u0430 \u043d\u0430\u043b\u0438\u0447\u043d\u0438 \u0442\u043e\u0447\u043a\u0438 \u0437\u0430 \u043f\u043e\u043a\u0430\u0437\u0432\u0430\u043d\u0435",
      mapNoMarkersText:
        "\u0421\u044a\u0437\u0434\u0430\u0439 \u0441\u0438\u0433\u043d\u0430\u043b \u0438\u043b\u0438 \u0437\u0430\u0440\u0435\u0434\u0438 \u0442\u0435\u043a\u0443\u0449\u0430\u0442\u0430 \u0441\u0438 \u043f\u043e\u0437\u0438\u0446\u0438\u044f.",
      loadedReports: "\u0417\u0430\u0440\u0435\u0434\u0435\u043d\u0438 \u0441\u0438\u0433\u043d\u0430\u043b\u0438",
      emptyFiltered:
        "\u041d\u044f\u043c\u0430 \u0441\u0438\u0433\u043d\u0430\u043b\u0438 \u0437\u0430 \u0442\u043e\u0437\u0438 \u0444\u0438\u043b\u0442\u044a\u0440.",
      mediaAttached: "\u041f\u0440\u0438\u043a\u0430\u0447\u0435\u043d\u0438 \u0444\u0430\u0439\u043b\u043e\u0432\u0435",
      cleanupEvidenceMedia:
        "\u0421\u043b\u0435\u0434 \u043f\u043e\u0447\u0438\u0441\u0442\u0432\u0430\u043d\u0435",
      originalReportMedia:
        "\u041f\u044a\u0440\u0432\u043e\u043d\u0430\u0447\u0430\u043b\u043d\u0438 \u0444\u0430\u0439\u043b\u043e\u0432\u0435",
      reporterLabel: "\u041f\u043e\u0434\u0430\u0434\u0435\u043d \u043e\u0442",
      reporterUnknown: "\u0410\u043d\u043e\u043d\u0438\u043c\u0435\u043d \u043f\u043e\u0442\u0440\u0435\u0431\u0438\u0442\u0435\u043b",
      openMedia: "\u041e\u0442\u0432\u043e\u0440\u0438 \u0444\u0430\u0439\u043b",
      openInMap: "\u041a\u0430\u0440\u0442\u0430",
      viewDetails: "\u0414\u0435\u0442\u0430\u0439\u043b\u0438",
      detailsTitle:
        "\u0414\u0435\u0442\u0430\u0439\u043b\u0438 \u043d\u0430 \u0441\u0438\u0433\u043d\u0430\u043b\u0430",
      coordinatesLabel:
        "\u041a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u0438",
      createdAtLabel:
        "\u0421\u044a\u0437\u0434\u0430\u0434\u0435\u043d \u043d\u0430",
      loadReportsFailed:
        "\u041d\u0435\u0443\u0441\u043f\u0435\u0448\u043d\u043e \u0437\u0430\u0440\u0435\u0436\u0434\u0430\u043d\u0435 \u043d\u0430 \u0441\u0438\u0433\u043d\u0430\u043b\u0438\u0442\u0435.",
      newReportTitle: "\u041d\u043e\u0432 \u0441\u0438\u0433\u043d\u0430\u043b",
      useCurrentLocation:
        "\u0418\u0437\u043f\u043e\u043b\u0437\u0432\u0430\u0439 \u0442\u0435\u043a\u0443\u0449\u0430\u0442\u0430 GPS \u043f\u043e\u0437\u0438\u0446\u0438\u044f",
      manualCoordinatesTitle:
        "\u0420\u044a\u0447\u043d\u043e \u0432\u044a\u0432\u0435\u0436\u0434\u0430\u043d\u0435 \u043d\u0430 \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u0438",
      manualCoordinatesHint:
        "\u041c\u043e\u0436\u0435\u0448 \u0434\u0430 \u0432\u044a\u0432\u0435\u0434\u0435\u0448 \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u0438\u0442\u0435 \u0440\u044a\u0447\u043d\u043e \u0438\u043b\u0438 \u0441 copy/paste \u043e\u0442 \u0434\u0440\u0443\u0433 \u0438\u0437\u0442\u043e\u0447\u043d\u0438\u043a.",
      manualCoordinatesPasteHint:
        "\u041c\u043e\u0436\u0435\u0448 \u0434\u0430 paste-\u043d\u0435\u0448 `42.697708, 23.321868` \u0438\u043b\u0438 Google Maps \u043b\u0438\u043d\u043a \u0432 \u043a\u043e\u0435\u0442\u043e \u0438 \u0434\u0430 \u0435 \u043f\u043e\u043b\u0435.",
      addressOrLink:
        "\u0410\u0434\u0440\u0435\u0441 \u0438\u043b\u0438 \u043b\u0438\u043d\u043a",
      addressOrLinkPlaceholder:
        "\u041f\u043e\u0441\u0442\u0430\u0432\u0438 \u0430\u0434\u0440\u0435\u0441 \u0438\u043b\u0438 Google Maps \u043b\u0438\u043d\u043a",
      findAddress:
        "\u041d\u0430\u043c\u0435\u0440\u0438 \u0430\u0434\u0440\u0435\u0441\u0430",
      addressRequired:
        "\u0412\u044a\u0432\u0435\u0434\u0438 \u0430\u0434\u0440\u0435\u0441 \u0438\u043b\u0438 \u043b\u0438\u043d\u043a.",
      addressLookupFailed:
        "\u041d\u0435 \u0443\u0441\u043f\u044f\u0445 \u0434\u0430 \u043d\u0430\u043c\u0435\u0440\u044f \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u0438 \u0437\u0430 \u0442\u043e\u0437\u0438 \u0430\u0434\u0440\u0435\u0441.",
      latitudePlaceholder: "\u041d\u0430\u043f\u0440. 42.697708",
      longitudePlaceholder: "\u041d\u0430\u043f\u0440. 23.321868",
      applyManualCoordinates:
        "\u0418\u0437\u043f\u043e\u043b\u0437\u0432\u0430\u0439 \u0432\u044a\u0432\u0435\u0434\u0435\u043d\u0438\u0442\u0435 \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u0438",
      invalidManualCoordinates:
        "\u041a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u0438\u0442\u0435 \u0441\u0430 \u043d\u0435\u0432\u0430\u043b\u0438\u0434\u043d\u0438. \u041f\u0440\u043e\u0432\u0435\u0440\u0438 \u0444\u043e\u0440\u043c\u0430\u0442\u0430 \u0438 \u0434\u0438\u0430\u043f\u0430\u0437\u043e\u043d\u0430 \u0438\u043c.",
      mediaSectionTitle: "\u0421\u043d\u0438\u043c\u043a\u0438 \u0438 \u0432\u0438\u0434\u0435\u043e",
      mediaSelectionHint:
        "\u041c\u043e\u0436\u0435\u0448 \u0434\u0430 \u0434\u043e\u0431\u0430\u0432\u0438\u0448 \u043d\u044f\u043a\u043e\u043b\u043a\u043e \u0441\u043d\u0438\u043c\u043a\u0438, \u0432\u0438\u0434\u0435\u043e \u0438\u043b\u0438 \u043a\u043e\u043c\u0431\u0438\u043d\u0430\u0446\u0438\u044f \u043e\u0442 \u0434\u0432\u0435\u0442\u0435.",
      selectedFilesCount:
        "\u0418\u0437\u0431\u0440\u0430\u043d\u0438 \u0444\u0430\u0439\u043b\u043e\u0432\u0435: {count}",
      mediaLimitReached:
        "\u041c\u043e\u0436\u0435\u0448 \u0434\u0430 \u0434\u043e\u0431\u0430\u0432\u0438\u0448 \u043d\u0430\u0439-\u043c\u043d\u043e\u0433\u043e {count} \u0444\u0430\u0439\u043b\u0430.",
      useCamera: "\u041a\u0430\u043c\u0435\u0440\u0430",
      recordVideo: "\u0412\u0438\u0434\u0435\u043e",
      chooseFromGallery: "\u0413\u0430\u043b\u0435\u0440\u0438\u044f",
      videoSelected: "\u0418\u0437\u0431\u0440\u0430\u043d\u043e \u0432\u0438\u0434\u0435\u043e",
      selectedFile: "\u0418\u0437\u0431\u0440\u0430\u043d \u0444\u0430\u0439\u043b",
      selectedType: "\u0422\u0438\u043f",
      selectedSize: "\u0420\u0430\u0437\u043c\u0435\u0440",
      imageLabel: "\u0421\u043d\u0438\u043c\u043a\u0430",
      videoLabel: "\u0412\u0438\u0434\u0435\u043e",
      sizeUnknown: "\u041d\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u0435\u043d",
      removeMedia: "\u041f\u0440\u0435\u043c\u0430\u0445\u043d\u0438 \u0444\u0430\u0439\u043b\u0430",
      mediaRequiredHint:
        "\u0417\u0430 \u043f\u0443\u0431\u043b\u0438\u043a\u0443\u0432\u0430\u043d\u0435 \u0442\u0440\u044f\u0431\u0432\u0430 \u0434\u0430 \u0434\u043e\u0431\u0430\u0432\u0438\u0448 \u0441\u043d\u0438\u043c\u043a\u0430 \u0438\u043b\u0438 \u0432\u0438\u0434\u0435\u043e.",
      cleanupUploadTitle:
        "\u0421\u043d\u0438\u043c\u043a\u0438 \u0438 \u0432\u0438\u0434\u0435\u043e \u0441\u043b\u0435\u0434 \u043f\u043e\u0447\u0438\u0441\u0442\u0432\u0430\u043d\u0435",
      cleanupUploadHint:
        "\u0410\u0432\u0442\u043e\u0440\u044a\u0442 \u0438 \u0437\u0430\u043f\u0438\u0441\u0430\u043d\u0438\u0442\u0435 \u0443\u0447\u0430\u0441\u0442\u043d\u0438\u0446\u0438 \u043c\u043e\u0433\u0430\u0442 \u0434\u0430 \u043a\u0430\u0447\u0432\u0430\u0442 \u0441\u043d\u0438\u043c\u043a\u0438 \u0438 \u0432\u0438\u0434\u0435\u043e \u043e\u0442 \u043f\u043e\u0447\u0438\u0441\u0442\u0435\u043d\u043e\u0442\u043e \u043c\u044f\u0441\u0442\u043e.",
      cleanupUploadSuccess:
        "\u0424\u0430\u0439\u043b\u043e\u0432\u0435\u0442\u0435 \u0431\u044f\u0445\u0430 \u0434\u043e\u0431\u0430\u0432\u0435\u043d\u0438 \u043a\u044a\u043c \u0441\u0438\u0433\u043d\u0430\u043b\u0430.",
      cleanupUploadFailed:
        "\u041d\u0435\u0443\u0441\u043f\u0435\u0448\u043d\u043e \u043a\u0430\u0447\u0432\u0430\u043d\u0435 \u043d\u0430 \u0444\u0430\u0439\u043b\u043e\u0432\u0435\u0442\u0435.",
      latitude:
        "\u0413\u0435\u043e\u0433\u0440\u0430\u0444\u0441\u043a\u0430 \u0448\u0438\u0440\u0438\u043d\u0430",
      longitude:
        "\u0413\u0435\u043e\u0433\u0440\u0430\u0444\u0441\u043a\u0430 \u0434\u044a\u043b\u0436\u0438\u043d\u0430",
      accuracy: "\u0422\u043e\u0447\u043d\u043e\u0441\u0442 (\u043c)",
      selectedLocationPreview:
        "\u041f\u0440\u0435\u0433\u043b\u0435\u0434 \u043d\u0430 \u0438\u0437\u0431\u0440\u0430\u043d\u0430\u0442\u0430 \u043b\u043e\u043a\u0430\u0446\u0438\u044f",
      serviceAreaPreviewTitle:
        "\u0420\u0430\u0439\u043e\u043d\u0438 \u043d\u0430 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435",
      selectLocationForPreview:
        "\u0418\u0437\u0431\u0435\u0440\u0438 \u0442\u0435\u043a\u0443\u0449\u0430 \u043f\u043e\u0437\u0438\u0446\u0438\u044f \u0438\u043b\u0438 \u0432\u044a\u0432\u0435\u0434\u0438 \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u0438, \u0437\u0430 \u0434\u0430 \u0432\u0438\u0434\u0438\u0448 preview.",
      serviceAreaHint:
        "\u0417\u0435\u043b\u0435\u043d\u0438\u0442\u0435 \u043e\u0447\u0435\u0440\u0442\u0430\u043d\u0438\u044f \u043f\u043e\u043a\u0430\u0437\u0432\u0430\u0442 \u0430\u043a\u0442\u0438\u0432\u043d\u0438\u0442\u0435 \u0440\u0430\u0439\u043e\u043d\u0438 \u043d\u0430 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435.",
      selectedServiceArea:
        "\u0418\u0437\u0431\u0440\u0430\u043d\u0438\u044f\u0442 \u0441\u0438\u0433\u043d\u0430\u043b \u0435 \u0432 \u0440\u0430\u0439\u043e\u043d: {name}",
      outsideServiceArea:
        "\u0421\u0438\u0433\u043d\u0430\u043b\u044a\u0442 \u0435 \u0438\u0437\u0432\u044a\u043d \u0440\u0430\u0439\u043e\u043d\u0430 \u043d\u0430 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435.",
      description:
        "\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435 / \u043a\u043e\u043c\u0435\u043d\u0442\u0430\u0440",
      descriptionHint: "\u041c\u0438\u043d\u0438\u043c\u0443\u043c 5 \u0441\u0438\u043c\u0432\u043e\u043b\u0430.",
      descriptionPlaceholder:
        "\u041e\u043f\u0438\u0448\u0438 \u0438\u043b\u0438 \u043a\u043e\u043c\u0435\u043d\u0442\u0438\u0440\u0430\u0439 \u0437\u0430\u043c\u044a\u0440\u0441\u0435\u043d\u043e\u0442\u043e \u043c\u044f\u0441\u0442\u043e",
      readyChecklistTitle:
        "\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442 \u0437\u0430 \u043f\u0443\u0431\u043b\u0438\u043a\u0443\u0432\u0430\u043d\u0435",
      readyLocation: "\u041b\u043e\u043a\u0430\u0446\u0438\u044f",
      readyMedia: "\u041c\u0435\u0434\u0438\u044f",
      readyDescription: "\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435",
      readyYes: "\u0413\u043e\u0442\u043e\u0432\u043e",
      readyNo: "\u041b\u0438\u043f\u0441\u0432\u0430",
      publish: "\u041f\u0443\u0431\u043b\u0438\u043a\u0443\u0432\u0430\u0439",
      reportCreated:
        "\u0421\u0438\u0433\u043d\u0430\u043b\u044a\u0442 \u0435 \u043f\u0443\u0431\u043b\u0438\u043a\u0443\u0432\u0430\u043d",
      locationRequired:
        "\u041b\u043e\u043a\u0430\u0446\u0438\u044f\u0442\u0430 \u0438 \u043e\u043f\u0438\u0441\u0430\u043d\u0438\u0435\u0442\u043e \u0441\u0430 \u0437\u0430\u0434\u044a\u043b\u0436\u0438\u0442\u0435\u043b\u043d\u0438.",
      publishRequirements:
        "\u041b\u043e\u043a\u0430\u0446\u0438\u044f\u0442\u0430, \u043e\u043f\u0438\u0441\u0430\u043d\u0438\u0435\u0442\u043e \u0438 \u043c\u0435\u0434\u0438\u044f\u0442\u0430 \u0441\u0430 \u0437\u0430\u0434\u044a\u043b\u0436\u0438\u0442\u0435\u043b\u043d\u0438.",
      locationPermissionRequired:
        "\u041d\u0443\u0436\u043d\u043e \u0435 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043d\u0438\u0435 \u0437\u0430 \u043c\u0435\u0441\u0442\u043e\u043f\u043e\u043b\u043e\u0436\u0435\u043d\u0438\u0435.",
      mediaLibraryPermissionRequired:
        "\u041d\u0443\u0436\u043d\u043e \u0435 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043d\u0438\u0435 \u0437\u0430 \u0433\u0430\u043b\u0435\u0440\u0438\u044f\u0442\u0430.",
      cameraPermissionRequired:
        "\u041d\u0443\u0436\u043d\u043e \u0435 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043d\u0438\u0435 \u0437\u0430 \u043a\u0430\u043c\u0435\u0440\u0430\u0442\u0430.",
      getLocationFailed:
        "\u041d\u0435\u0443\u0441\u043f\u0435\u0448\u043d\u043e \u0432\u0437\u0438\u043c\u0430\u043d\u0435 \u043d\u0430 \u043f\u043e\u0437\u0438\u0446\u0438\u044f.",
      pickMediaFailed:
        "\u041d\u0435\u0443\u0441\u043f\u0435\u0448\u0435\u043d \u0438\u0437\u0431\u043e\u0440 \u043d\u0430 \u0444\u0430\u0439\u043b.",
      publishFailed:
        "\u041d\u0435\u0443\u0441\u043f\u0435\u0448\u043d\u043e \u043f\u0443\u0431\u043b\u0438\u043a\u0443\u0432\u0430\u043d\u0435 \u043d\u0430 \u0441\u0438\u0433\u043d\u0430\u043b."
    },
    chat: {
      open: "\u0427\u0430\u0442",
      title: "\u0427\u0430\u0442 \u043f\u043e \u0441\u0438\u0433\u043d\u0430\u043b\u0430",
      empty:
        "\u041e\u0449\u0435 \u043d\u044f\u043c\u0430 \u0441\u044a\u043e\u0431\u0449\u0435\u043d\u0438\u044f. \u0417\u0430\u043f\u043e\u0447\u043d\u0438 \u0440\u0430\u0437\u0433\u043e\u0432\u043e\u0440\u0430 \u043f\u043e \u0442\u043e\u0437\u0438 \u0441\u0438\u0433\u043d\u0430\u043b.",
      messagePlaceholder:
        "\u041d\u0430\u043f\u0438\u0448\u0438 \u0441\u044a\u043e\u0431\u0449\u0435\u043d\u0438\u0435",
      send: "\u0418\u0437\u043f\u0440\u0430\u0442\u0438",
      sending: "\u0418\u0437\u043f\u0440\u0430\u0449\u0430\u043d\u0435...",
      you: "\u0422\u0438",
      anonymous: "\u041f\u043e\u0442\u0440\u0435\u0431\u0438\u0442\u0435\u043b",
      messageRequired:
        "\u0421\u044a\u043e\u0431\u0449\u0435\u043d\u0438\u0435\u0442\u043e \u0435 \u0437\u0430\u0434\u044a\u043b\u0436\u0438\u0442\u0435\u043b\u043d\u043e.",
      loadCommentsFailed:
        "\u041d\u0435 \u0443\u0441\u043f\u044f\u0445 \u0434\u0430 \u0437\u0430\u0440\u0435\u0434\u044f \u0447\u0430\u0442 \u0441\u044a\u043e\u0431\u0449\u0435\u043d\u0438\u044f\u0442\u0430.",
      sendMessageFailed:
        "\u041d\u0435 \u0443\u0441\u043f\u044f\u0445 \u0434\u0430 \u0438\u0437\u043f\u0440\u0430\u0442\u044f \u0441\u044a\u043e\u0431\u0449\u0435\u043d\u0438\u0435\u0442\u043e.",
      resolvedReadOnly:
        "\u0420\u0435\u0448\u0435\u043d\u0438\u044f\u0442 \u0441\u0438\u0433\u043d\u0430\u043b \u0435 \u0441\u0430\u043c\u043e \u0437\u0430 \u043f\u0440\u0435\u0433\u043b\u0435\u0434."
    },
    initiatives: {
      title: "\u0418\u0434\u0435\u0438 \u0438 \u0438\u043d\u0438\u0446\u0438\u0430\u0442\u0438\u0432\u0438",
      empty: "\u041e\u0449\u0435 \u043d\u044f\u043c\u0430 \u043f\u0443\u0431\u043b\u0438\u0447\u043d\u0438 \u0438\u0434\u0435\u0438 \u0438 \u0438\u043d\u0438\u0446\u0438\u0430\u0442\u0438\u0432\u0438.",
      publishedAt: "\u041f\u0443\u0431\u043b\u0438\u043a\u0443\u0432\u0430\u043d\u043e",
      createdAt: "\u041f\u043e\u0434\u0430\u0434\u0435\u043d\u043e",
      submittedBy: "\u041f\u043e\u0434\u0430\u0434\u0435\u043d\u043e \u043e\u0442",
      approved: "\u041e\u0434\u043e\u0431\u0440\u0435\u043d\u0430",
      published: "\u0417\u0430 \u043e\u0431\u0441\u044a\u0436\u0434\u0430\u043d\u0435",
      executed: "\u0418\u0437\u043f\u044a\u043b\u043d\u0435\u043d\u0430",
      loginToComment:
        "\u0417\u0430 \u0447\u0430\u0442 \u043f\u043e \u0438\u0434\u0435\u044f \u0438\u043b\u0438 \u0438\u043d\u0438\u0446\u0438\u0430\u0442\u0438\u0432\u0430 \u0435 \u043d\u0443\u0436\u0435\u043d \u0432\u0445\u043e\u0434.",
      chatTitle: "\u0427\u0430\u0442 \u043f\u043e \u0438\u0434\u0435\u044f\u0442\u0430",
      loadFailed:
        "\u041d\u0435 \u0443\u0441\u043f\u044f\u0445 \u0434\u0430 \u0437\u0430\u0440\u0435\u0434\u044f \u0438\u0434\u0435\u0438\u0442\u0435 \u0438 \u0438\u043d\u0438\u0446\u0438\u0430\u0442\u0438\u0432\u0438\u0442\u0435."
    },
    statuses: {
      new: "\u043d\u043e\u0432",
      in_review: "\u0432 \u043f\u0440\u0435\u0433\u043b\u0435\u0434",
      planned_cleanup:
        "\u043f\u043b\u0430\u043d\u0438\u0440\u0430\u043d\u0435 \u043d\u0430 \u043f\u043e\u0447\u0438\u0441\u0442\u0432\u0430\u043d\u0435",
      resolved: "\u0440\u0435\u0448\u0435\u043d",
      rejected: "\u043e\u0442\u0445\u0432\u044a\u0440\u043b\u0435\u043d"
    }
  },
  en: {
    common: {
      show: "Show",
      hide: "Hide",
      close: "Close",
      cancel: "Cancel",
      save: "Save",
      logout: "Logout",
      bg: "BG",
      en: "EN",
      sourceMobile: "mobile",
      sourceWeb: "web",
      sourceChat: "chat"
    },
    app: {
      title: "Clean Sea",
      missingEnvTitle: "Missing Mobile Env",
      missingEnvText:
        "Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/mobile/.env, then restart the app.",
      reportsTab: "Reports",
      initiativesTab: "Ideas",
      newReportTab: "New Report"
    },
    auth: {
      loginTitle: "Login",
      signUpTitle: "Create Account",
      forgotTitle: "Forgot Password",
      resetTitle: "Reset Password",
      usernameLabel: "Username",
      emailLabel: "Email",
      phoneLabel: "Phone",
      passwordLabel: "Password",
      confirmPasswordLabel: "Confirm Password",
      newPasswordLabel: "New Password",
      loginButton: "Login",
      signUpButton: "Sign up",
      googleButton: "Continue with Google",
      forgotButton: "Send reset link",
      resetButton: "Update password",
      backToLogin: "Back to login",
      forgotLink: "Forgot password?",
      createAccountLink: "Create account",
      emailPlaceholder: "Enter email",
      usernamePlaceholder: "Enter username",
      phonePlaceholder: "Enter contact phone",
      passwordPlaceholder: "Enter password",
      confirmPasswordPlaceholder: "Re-enter password",
      newPasswordPlaceholder: "Enter new password",
      emailPasswordRequired: "Email and password are required.",
      signUpRequired: "Username, email, and password are required.",
      emailRequired: "Email is required.",
      passwordTooShort: "Password must be at least 8 characters.",
      passwordsDoNotMatch: "Passwords do not match.",
      googleCanceled: "Google sign in was canceled.",
      signUpCheckEmail: "Account created. Check your email to confirm.",
      resetLinkSent: "Reset link sent. Check your email.",
      passwordUpdated: "Password updated successfully."
    },
    reports: {
      listTitle: "Reports",
      filterAll: "All",
      feedTitle: "Field Feed",
      currentPositionUnavailable: "Current position unavailable",
      currentPosition: "Current position",
      mapUnavailableTitle: "Map is temporarily unavailable",
      mapUnavailableText:
        "Run a clean Android rebuild after setting the Google Maps API key.",
      mapNoMarkersTitle: "No points available on the map",
      mapNoMarkersText: "Create a report or load your current position first.",
      loadedReports: "Loaded reports",
      emptyFiltered: "No reports match this filter.",
      mediaAttached: "Attached files",
      cleanupEvidenceMedia: "After cleanup",
      originalReportMedia: "Original files",
      reporterLabel: "Reported by",
      reporterUnknown: "Anonymous user",
      openMedia: "Open file",
      openInMap: "Map",
      viewDetails: "Details",
      detailsTitle: "Report details",
      coordinatesLabel: "Coordinates",
      createdAtLabel: "Created at",
      loadReportsFailed: "Failed to load reports.",
      newReportTitle: "New Report",
      useCurrentLocation: "Use current GPS location",
      manualCoordinatesTitle: "Manual coordinates",
      manualCoordinatesHint:
        "You can enter coordinates manually or paste them from another source.",
      manualCoordinatesPasteHint:
        "You can paste `42.697708, 23.321868` or a Google Maps link into either field.",
      addressOrLink: "Address or link",
      addressOrLinkPlaceholder: "Paste an address or Google Maps link",
      findAddress: "Find address",
      addressRequired: "Enter an address or link.",
      addressLookupFailed: "Could not find coordinates for this address.",
      latitudePlaceholder: "E.g. 42.697708",
      longitudePlaceholder: "E.g. 23.321868",
      applyManualCoordinates: "Use entered coordinates",
      invalidManualCoordinates:
        "Coordinates are invalid. Check the format and ranges.",
      mediaSectionTitle: "Photos and video",
      mediaSelectionHint:
        "You can add multiple photos, a video, or a combination of both.",
      selectedFilesCount: "Selected files: {count}",
      mediaLimitReached: "You can add up to {count} files.",
      useCamera: "Camera",
      recordVideo: "Video",
      chooseFromGallery: "Gallery",
      videoSelected: "Video selected",
      selectedFile: "Selected file",
      selectedType: "Type",
      selectedSize: "Size",
      imageLabel: "Image",
      videoLabel: "Video",
      sizeUnknown: "Unknown",
      removeMedia: "Remove file",
      mediaRequiredHint: "Add a photo or video before publishing the report.",
      cleanupUploadTitle: "Post-cleanup photos and video",
      cleanupUploadHint:
        "The report author and joined cleanup participants can upload photos and video from the cleaned area.",
      cleanupUploadSuccess: "Files were added to the report.",
      cleanupUploadFailed: "Failed to upload the files.",
      latitude: "Latitude",
      longitude: "Longitude",
      accuracy: "Accuracy (m)",
      selectedLocationPreview: "Selected location preview",
      serviceAreaPreviewTitle: "Service areas",
      selectLocationForPreview:
        "Choose your current position or enter coordinates to see a preview.",
      serviceAreaHint: "Green outlines show the active service areas.",
      selectedServiceArea: "The selected report is inside service area: {name}",
      outsideServiceArea: "The report is outside the active service area.",
      description: "Description / comment",
      descriptionHint: "Minimum 5 characters.",
      descriptionPlaceholder: "Describe or comment on the polluted area",
      readyChecklistTitle: "Publish readiness",
      readyLocation: "Location",
      readyMedia: "Media",
      readyDescription: "Description",
      readyYes: "Ready",
      readyNo: "Missing",
      publish: "Publish",
      reportCreated: "Report published",
      locationRequired: "Location and description are required.",
      publishRequirements: "Location, description, and media are required.",
      locationPermissionRequired: "Location permission is required.",
      mediaLibraryPermissionRequired: "Media library permission is required.",
      cameraPermissionRequired: "Camera permission is required.",
      getLocationFailed: "Failed to get location.",
      pickMediaFailed: "Failed to select media.",
      publishFailed: "Failed to publish report."
    },
    chat: {
      open: "Chat",
      title: "Report chat",
      empty: "No messages yet. Start the conversation for this report.",
      messagePlaceholder: "Write a message",
      send: "Send",
      sending: "Sending...",
      you: "You",
      anonymous: "User",
      messageRequired: "Message is required.",
      loadCommentsFailed: "Failed to load chat messages.",
      sendMessageFailed: "Failed to send the message."
      ,
      resolvedReadOnly: "Resolved reports are read-only."
    },
    initiatives: {
      title: "Ideas and initiatives",
      empty: "No public ideas or initiatives yet.",
      publishedAt: "Published",
      createdAt: "Submitted",
      submittedBy: "Submitted by",
      approved: "Approved",
      published: "For discussion",
      executed: "Executed",
      loginToComment: "You need to be logged in to comment on an idea or initiative.",
      chatTitle: "Initiative chat",
      loadFailed: "Failed to load ideas and initiatives."
    },
    statuses: {
      new: "new",
      in_review: "in review",
      planned_cleanup: "planned cleanup",
      resolved: "resolved",
      rejected: "rejected"
    }
  }
} as const;

type TranslationTree = (typeof translations)[Language];

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: TranslationTree;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("bg");

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: translations[language]
    }),
    [language]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used within LanguageProvider.");
  }

  return context;
}
