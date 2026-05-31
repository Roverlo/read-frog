import { i18n } from "#imports"
import { ConfigCard } from "../../components/config-card"
import { EntityEditorLayout } from "../../components/entity-editor-layout"
import { CustomActionConfigForm } from "./action-config-form"
import { CustomActionCardList } from "./components/action-card-list"

export function CustomActionsConfig() {
  return (
    <ConfigCard
      id="custom-actions"
      title={i18n.t("options.floatingButtonAndToolbar.selectionToolbar.customActions.title")}
      description={i18n.t("options.floatingButtonAndToolbar.selectionToolbar.customActions.description")}
      className="lg:flex-col"
    >
      <EntityEditorLayout list={<CustomActionCardList />} editor={<CustomActionConfigForm />} />
    </ConfigCard>
  )
}
