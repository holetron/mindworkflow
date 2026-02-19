// db/index.ts — Re-export facade for backward compatibility
// All existing imports from '../db' or './db' continue to work unchanged.

// ---- Connection, DB instance, shared helpers ---------------------------------
export {
  db,
  hashContent,
  integerToBoolean,
  parseConnectionsJson,
  withTransaction,
  safeParse,
  createHttpError,
  booleanToInteger,
  serializeConnectionsJson,
  toNodeUI,
  decomposeNodeUI,
  extractConfig,
  deepMerge,
  deepClone,
  isPlainObject,
} from './connection';

// ---- All type exports --------------------------------------------------------
export type {
  ProjectRole,
  ProjectCollaborator,
  ProjectFlow,
  EdgeActionNotification,
  AddProjectEdgeResult,
  ProjectSummary,
  ProjectNode,
  ProjectEdge,
  RunRecord,
  PromptPresetCategory,
  PromptPreset,
  PromptPresetCreateInput,
  PromptPresetUpdateInput,
  FeedbackType,
  FeedbackStatus,
  FeedbackRecord,
  FeedbackSummary,
  FeedbackCreateInput,
  FeedbackUpdateInput,
  StoredNode,
  StoredEdge,
  NodeUpdatePatch,
  NodeCreateInput,
  AssetRecord,
  AdminUserSummary,
  AdminProjectSummary,
  AdminProjectCollaborator,
  PasswordResetTokenRecord,
  PromptPresetImportInput,
} from './types';

// ---- Project repository ------------------------------------------------------
export {
  ensureProjectDirs,
  mirrorProjectToDrive,
  writeProjectFile,
  getProjectRole,
  listProjectCollaborators,
  upsertProjectCollaborator,
  removeProjectCollaborator,
  projectExists,
  getProjectOwnerId,
  listProjects,
  getProject,
  importProject,
  updateProjectMetadata,
  updateProjectSettings,
  getProjectSettings,
  updateProjectOwner,
  deleteProjectRecord,
  generateCloneProjectId,
  cloneProjectRecord,
  listAdminProjects,
} from './repositories/projectRepository';

// ---- Node repository ---------------------------------------------------------
export {
  getNode,
  listProjectNodes,
  updateNodeContent,
  updateNode,
  updateNodeMetaSystem,
  createProjectNode,
  deleteProjectNode,
  cloneNode,
} from './repositories/nodeRepository';

// ---- Edge repository ---------------------------------------------------------
export {
  listProjectEdges,
  addProjectEdge,
  removeProjectEdge,
} from './repositories/edgeRepository';

// ---- User repository ---------------------------------------------------------
export {
  findUserByEmail,
  updateUserRecord,
  updateUserPassword,
  deleteUserCascade,
  issuePasswordResetToken,
  getPasswordResetToken,
  markPasswordResetTokenUsed,
  listAdminUsers,
} from './repositories/userRepository';

// ---- Run repository ----------------------------------------------------------
export {
  storeRun,
  getNodeRuns,
} from './repositories/runRepository';

// ---- Asset repository --------------------------------------------------------
export {
  createAssetRecord,
} from './repositories/assetRepository';

// ---- Preset repository -------------------------------------------------------
export {
  getPromptPreset,
  listPromptPresetsForAdmin,
  searchPromptPresets,
  listQuickPromptPresets,
  createPromptPreset,
  updatePromptPreset,
  deletePromptPreset,
  importPromptPresets,
} from './repositories/presetRepository';

// ---- Feedback repository -----------------------------------------------------
export {
  listFeedbackEntries,
  getFeedbackEntry,
  createFeedbackEntry,
  updateFeedbackEntry,
  deleteFeedbackEntry,
} from './repositories/feedbackRepository';
