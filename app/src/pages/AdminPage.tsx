import VersionBadge from '../components/VersionBadge';
import {
  AdminHeader,
  UserManagement,
  ProjectManagement,
  FeedbackManagement,
  EmailSettings,
  PromptManagement,
  IntegrationManagement,
  WorkflowSettings,
  useAdminState,
  useAdminActions,
} from '../components/admin';

export function AdminPage() {
  const s = useAdminState();
  const actions = useAdminActions(s);

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        <AdminHeader
          activeTab={s.activeTab}
          setActiveTab={s.setActiveTab}
          refreshing={s.refreshing}
          usersLoading={s.usersLoading}
          projectsLoading={s.projectsLoading}
          feedbackLoading={s.feedbackLoading}
          emailLoading={s.emailLoading}
          onRefresh={actions.handleRefresh}
          totalUsers={s.totalUsers}
          totalAdmins={s.totalAdmins}
          totalProjects={s.totalProjects}
          orphanProjects={s.orphanProjects}
          totalCollaborators={s.totalCollaborators}
          avgCollaboratorsPerProject={s.avgCollaboratorsPerProject}
          avgProjectsPerOwner={s.avgProjectsPerOwner}
          totalFeedback={s.totalFeedback}
          totalProblems={s.totalProblems}
          totalSuggestions={s.totalSuggestions}
          feedbackStatusCounts={s.feedbackStatusCounts}
          userSearch={s.userSearch}
          setUserSearch={s.setUserSearch}
          projectSearch={s.projectSearch}
          setProjectSearch={s.setProjectSearch}
          feedbackSearch={s.feedbackSearch}
          setFeedbackSearch={s.setFeedbackSearch}
          promptSearch={s.promptSearch}
          setPromptSearch={s.setPromptSearch}
        />

        {s.banner && (
          <div
            className={`rounded border px-4 py-2 text-sm ${
              s.banner.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
            }`}
          >
            {s.banner.message}
          </div>
        )}

        {s.activeTab === 'users' ? (
          <UserManagement
            users={s.users}
            filteredUsers={s.filteredUsers}
            usersError={s.usersError}
            usersLoading={s.usersLoading}
            userSearch={s.userSearch}
            processingUserId={s.processingUserId}
            selectedUser={s.selectedUser}
            editForm={s.editForm}
            editSubmitting={s.editSubmitting}
            onToggleAdmin={actions.handleToggleAdmin}
            onOpenEdit={actions.handleOpenEdit}
            onCloseEdit={actions.closeEditModal}
            onEditFieldChange={actions.handleEditFieldChange}
            onSaveEdit={actions.handleSaveEdit}
            onDeleteUser={actions.handleDeleteUser}
          />
        ) : s.activeTab === 'projects' ? (
          <ProjectManagement
            projects={s.projects}
            filteredProjects={s.filteredProjects}
            projectsError={s.projectsError}
            projectsLoading={s.projectsLoading}
            projectSearch={s.projectSearch}
            selectedProject={s.selectedProject}
            setSelectedProject={s.setSelectedProject}
            selectedOwnerUserId={s.selectedOwnerUserId}
            setSelectedOwnerUserId={s.setSelectedOwnerUserId}
            changeOwnerSubmitting={s.changeOwnerSubmitting}
            users={s.users}
            onCloseChangeOwner={actions.closeChangeOwnerModal}
            onChangeOwner={actions.handleChangeOwner}
          />
        ) : s.activeTab === 'feedback' ? (
          <FeedbackManagement
            feedback={s.feedback}
            filteredFeedback={s.filteredFeedback}
            feedbackError={s.feedbackError}
            feedbackLoading={s.feedbackLoading}
            feedbackSearch={s.feedbackSearch}
            feedbackModalOpen={s.feedbackModalOpen}
            feedbackDetails={s.feedbackDetails}
            feedbackDetailsLoading={s.feedbackDetailsLoading}
            feedbackForm={s.feedbackForm}
            feedbackSaving={s.feedbackSaving}
            feedbackDeleting={s.feedbackDeleting}
            feedbackModalError={s.feedbackModalError}
            feedbackDirty={s.feedbackDirty}
            selectedFeedbackId={s.selectedFeedbackId}
            onOpenFeedbackModal={actions.openFeedbackModal}
            onCloseFeedbackModal={actions.closeFeedbackModal}
            onFeedbackFieldChange={actions.handleFeedbackFieldChange}
            onFeedbackStatusChange={actions.handleFeedbackStatusChange}
            onSaveFeedback={actions.handleSaveFeedback}
            onDeleteFeedback={actions.handleDeleteFeedback}
          />
        ) : s.activeTab === 'integrations' ? (
          <IntegrationManagement
            integrations={s.integrations}
            integrationsError={s.integrationsError}
            integrationsLoading={s.integrationsLoading}
            users={s.users}
            selectedIntegration={s.selectedIntegration}
            integrationForm={s.integrationForm}
            integrationSubmitting={s.integrationSubmitting}
            providerMap={s.providerMap}
            onSelectIntegration={actions.handleSelectIntegration}
            onNewIntegration={actions.handleNewIntegration}
            onIntegrationFormChange={actions.handleIntegrationFormChange}
            onSaveIntegration={actions.handleSaveIntegration}
            onDeleteIntegration={actions.handleDeleteIntegration}
            onRefreshIntegrations={actions.handleRefreshIntegrations}
            onCancelIntegrationEdit={actions.handleCancelIntegrationEdit}
            setIntegrationForm={s.setIntegrationForm}
          />
        ) : s.activeTab === 'prompts' ? (
          <PromptManagement
            promptPresets={s.promptPresets}
            promptsError={s.promptsError}
            promptsLoading={s.promptsLoading}
            promptSearch={s.promptSearch}
            promptCategoryFilter={s.promptCategoryFilter}
            setPromptCategoryFilter={s.setPromptCategoryFilter}
            promptModalOpen={s.promptModalOpen}
            promptSubmitting={s.promptSubmitting}
            editingPrompt={s.editingPrompt}
            promptForm={s.promptForm}
            promptExporting={s.promptExporting}
            promptImporting={s.promptImporting}
            promptImportMode={s.promptImportMode}
            setPromptImportMode={s.setPromptImportMode}
            importFileInputRef={s.importFileInputRef}
            onOpenCreatePrompt={actions.handleOpenCreatePrompt}
            onOpenEditPrompt={actions.handleOpenEditPrompt}
            onClosePromptModal={actions.handleClosePromptModal}
            onPromptFieldChange={actions.handlePromptFieldChange}
            onPromptSubmit={actions.handlePromptSubmit}
            onPromptDelete={actions.handlePromptDelete}
            onExportPrompts={actions.handleExportPrompts}
            onTriggerPromptImport={actions.handleTriggerPromptImport}
            onPromptFileChange={actions.handlePromptFileChange}
          />
        ) : s.activeTab === 'settings' ? (
          <EmailSettings
            emailError={s.emailError}
            emailLoading={s.emailLoading}
            emailConfig={s.emailConfig}
            emailForm={s.emailForm}
            emailSubmitting={s.emailSubmitting}
            emailTesting={s.emailTesting}
            emailTestBanner={s.emailTestBanner}
            onEmailFieldChange={actions.handleEmailFieldChange}
            onEmailSubmit={actions.handleEmailSubmit}
            onEmailTest={actions.handleEmailTest}
          />
        ) : s.activeTab === 'workflow' ? (
          <WorkflowSettings
            workflowSettings={s.workflowSettings}
            workflowSettingsLoading={s.workflowSettingsLoading}
            workflowSettingsSaving={s.workflowSettingsSaving}
            workflowSettingsError={s.workflowSettingsError}
            workflowSettingsSuccess={s.workflowSettingsSuccess}
            onWorkflowMarkdownChange={actions.handleWorkflowMarkdownChange}
            onWorkflowFontScalingChange={actions.handleWorkflowFontScalingChange}
            onWorkflowSettingsSave={actions.handleWorkflowSettingsSave}
            onWorkflowSettingsReset={actions.handleWorkflowSettingsReset}
            setWorkflowSettings={actions.setWorkflowSettings}
          />
        ) : null}
      </div>
      <VersionBadge className="absolute bottom-4 right-6" />
    </div>
  );
}
