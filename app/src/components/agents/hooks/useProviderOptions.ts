import { useEffect, useMemo } from 'react';
import { useGlobalIntegrationsStore } from '../../../state/globalIntegrationsStore';
import { PROVIDERS } from '../../../data/providers';
import { DEFAULT_REPLICATE_MODELS } from '../../../data/defaultReplicateModels';
import type { AiProviderOption } from '../types';

/**
 * Hook that manages global integrations loading, model auto-sync,
 * and builds the provider option list used by the agent editor.
 */
export function useProviderOptions(): AiProviderOption[] {
  const { integrations: globalIntegrations, fetchIntegrations, refreshIntegrationModels } =
    useGlobalIntegrationsStore();

  // --------------- Provider catalog ---------------
  const providerCatalog = useMemo(() => {
    return new Map(PROVIDERS.map((provider) => [provider.id, provider]));
  }, []);

  // --------------- Build provider options from integrations ---------------
  const providerOptions = useMemo<AiProviderOption[]>(() => {
    try {
      const options: AiProviderOption[] = [];

      if (!globalIntegrations || !Array.isArray(globalIntegrations)) {
        console.log('[AgentsPage] No integrations available:', globalIntegrations);
        return options;
      }

      console.log(
        '[AgentsPage] Building provider options from',
        globalIntegrations.length,
        'integrations',
      );

      globalIntegrations.forEach((integration) => {
        if (!integration) return;

        const hasApiKey =
          (typeof integration.apiKey === 'string' && integration.apiKey.trim().length > 0) ||
          integration.apiKeyStored === true;
        const hasBaseUrl =
          typeof integration.baseUrl === 'string' && integration.baseUrl.trim().length > 0;
        const isEnabled = integration.enabled !== false;
        const providerConfig = providerCatalog.get(integration.providerId);
        const supportsFiles = providerConfig?.supportsFiles ?? false;
        const supportedFileTypes = providerConfig?.supportedFileTypes ?? [];
        const displayName =
          integration.providerId === 'midjourney_proxy'
            ? providerConfig?.name ?? 'Midjourney Relay'
            : integration.name || providerConfig?.name || integration.providerId;
        const requiresRelay = integration.providerId === 'midjourney_proxy';
        const available = isEnabled && (requiresRelay ? hasApiKey && hasBaseUrl : hasApiKey);

        let reason: string | undefined;
        if (!isEnabled) {
          reason = '\u0418\u043D\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044F \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u0430 \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u043E\u043C';
        } else if (requiresRelay && (!hasApiKey || !hasBaseUrl)) {
          reason =
            '\u0423\u043A\u0430\u0436\u0438\u0442\u0435 Relay URL \u0438 Auth Token \u0432 \u0438\u043D\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044F\u0445.';
        } else if (!available) {
          reason =
            '\u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 API \u043A\u043B\u044E\u0447 \u0432 \u0438\u043D\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044F\u0445, \u0447\u0442\u043E\u0431\u044B \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0430.';
        }

        let models: string[] = [];
        let defaultModel = '';

        if (integration.providerId === 'openai_gpt') {
          const storedModels =
            Array.isArray(integration.models) && integration.models.length > 0
              ? integration.models
              : ['chatgpt-4o-latest', 'gpt-4o-mini', 'gpt-3.5-turbo'];
          models = storedModels;
          defaultModel = storedModels[0] ?? 'gpt-4o-mini';
        } else if (integration.providerId === 'anthropic') {
          const storedModels =
            Array.isArray(integration.models) && integration.models.length > 0
              ? integration.models
              : ['claude-3-haiku', 'claude-3-sonnet', 'claude-3-opus'];
          models = storedModels;
          defaultModel = storedModels[0] ?? 'claude-3-haiku';
        } else if (
          integration.providerId === 'google_workspace' ||
          integration.providerId === 'google_gemini'
        ) {
          const storedModels =
            Array.isArray(integration.models) && integration.models.length > 0
              ? integration.models
              : [
                  'gemini-2.5-flash',
                  'gemini-2.5-pro',
                  'gemini-2.0-flash',
                  'gemini-flash-latest',
                  'gemini-pro-latest',
                ];
          models = storedModels;
          defaultModel = storedModels[0] ?? 'gemini-2.5-flash';
        } else if (integration.providerId === 'google_ai_studio') {
          const storedModels =
            Array.isArray(integration.models) && integration.models.length > 0
              ? integration.models
              : ['gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'];
          models = storedModels;
          defaultModel = storedModels[0] ?? 'gemini-2.0-flash';
        } else if (integration.providerId === 'replicate') {
          const hasStoredModels =
            Array.isArray(integration.models) && integration.models.length > 0;
          const storedModels = hasStoredModels ? integration.models : DEFAULT_REPLICATE_MODELS;
          console.log(
            '[AgentsPage] Replicate integration:',
            integration.name,
            'Models count:',
            storedModels.length,
            'Has stored:',
            hasStoredModels,
          );
          models = storedModels;
          defaultModel =
            storedModels[0] || DEFAULT_REPLICATE_MODELS[0] || 'black-forest-labs/flux-schnell';
        } else if (integration.providerId.startsWith('midjourney_')) {
          const catalogModels = providerConfig?.models ?? [
            'midjourney-v7',
            'midjourney-v7-video',
            'midjourney-v6.1',
            'midjourney-v6',
            'midjourney-v5.2',
            'midjourney-v5.1',
            'midjourney-v5',
            'midjourney-niji-6',
            'midjourney-niji-5',
            'midjourney-niji-4',
          ];
          models = catalogModels;
          defaultModel = providerConfig?.defaultModel ?? catalogModels[0] ?? 'midjourney-v7';
        } else {
          models = ['default-model'];
          defaultModel = 'default-model';
        }

        options.push({
          id: integration.providerId,
          name: displayName,
          models,
          defaultModel,
          available,
          description: integration.description || `${integration.name} integration`,
          supportsFiles,
          supportedFileTypes,
          reason,
        });
      });

      return options;
    } catch (error) {
      console.error('[AgentsPage] Error building provider options:', error);
      return [];
    }
  }, [globalIntegrations, providerCatalog]);

  // --------------- Load integrations ---------------
  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  // --------------- Auto-sync models for integrations with empty models ---------------
  useEffect(() => {
    if (
      !globalIntegrations ||
      !Array.isArray(globalIntegrations) ||
      globalIntegrations.length === 0
    ) {
      return;
    }

    const syncEmptyModels = async () => {
      for (const integration of globalIntegrations) {
        const needsSync =
          (!Array.isArray(integration.models) || integration.models.length === 0) &&
          integration.enabled &&
          integration.apiKeyStored;

        if (needsSync) {
          console.log(`[AgentsPage] Auto-syncing models for ${integration.name}...`);
          try {
            await refreshIntegrationModels(integration.id, integration.providerId, { limit: 200 });
            console.log(`[AgentsPage] Successfully synced models for ${integration.name}`);
          } catch (err) {
            console.warn(`[AgentsPage] Failed to sync models for ${integration.name}:`, err);
          }
        }
      }
    };

    syncEmptyModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalIntegrations.length]);

  return providerOptions;
}
