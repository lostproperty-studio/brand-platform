import { createHash } from 'node:crypto';

// The Office add-in file (manifest) for one client: their Microsoft 365 admin uploads it once, under Settings →
// Integrated apps → Upload custom apps. Two files, because Office treats them separately: one for Word, PowerPoint
// and Excel, one for Outlook. Each adds a button to the Home tab that opens the LP panel.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** A stable id per client and file, so uploading a newer file updates the add-in rather than adding another */
const guid = (seed: string) => { const h = createHash('sha1').update(seed).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };

export function officeManifest(kind: 'documents' | 'mail', o: { origin: string; slug: string; client: string; projectId: string; version?: string }) {
  const name = esc(`${o.client} brand`.slice(0, 125));
  const about = esc(`${o.client}’s logos, colours, images and words, and answers about the brand, from Lost Property.`);
  const pane = esc(`${o.origin}/panel/office?p=${encodeURIComponent(o.slug)}`);
  const icon = (s: number) => esc(`${o.origin}/panel/icon-${s}.png`);
  const top = `  <Id>${guid(`lp-office-${kind}-${o.projectId}`)}</Id>
  <Version>${o.version || '1.0.0.0'}</Version>
  <ProviderName>Lost Property</ProviderName>
  <DefaultLocale>en-GB</DefaultLocale>
  <DisplayName DefaultValue="${name}"/>
  <Description DefaultValue="${about}"/>
  <IconUrl DefaultValue="${icon(64)}"/>
  <HighResolutionIconUrl DefaultValue="${icon(128)}"/>
  <SupportUrl DefaultValue="${esc(`${o.origin}/p/${o.slug}`)}"/>
  <AppDomains>
    <AppDomain>${esc(o.origin)}</AppDomain>
  </AppDomains>`;
  const icons = `<Icon>
                <bt:Image size="16" resid="Icon.16"/>
                <bt:Image size="32" resid="Icon.32"/>
                <bt:Image size="80" resid="Icon.80"/>
              </Icon>`;
  const resources = `    <Resources>
      <bt:Images>
        <bt:Image id="Icon.16" DefaultValue="${icon(16)}"/>
        <bt:Image id="Icon.32" DefaultValue="${icon(32)}"/>
        <bt:Image id="Icon.80" DefaultValue="${icon(80)}"/>
      </bt:Images>
      <bt:Urls>
        <bt:Url id="Taskpane.Url" DefaultValue="${pane}"/>
      </bt:Urls>
      <bt:ShortStrings>
        <bt:String id="Group.Label" DefaultValue="${name}"/>
        <bt:String id="Button.Label" DefaultValue="Brand"/>
      </bt:ShortStrings>
      <bt:LongStrings>
        <bt:String id="Button.Tip" DefaultValue="${about}"/>
      </bt:LongStrings>
    </Resources>`;
  const button = (tab: string) => `<ExtensionPoint xsi:type="${tab === 'TabHome' ? 'PrimaryCommandSurface' : 'MessageComposeCommandSurface'}">
            <OfficeTab id="${tab}">
              <Group id="LP.Brand.Group">
                <Label resid="Group.Label"/>
              ${icons}
                <Control xsi:type="Button" id="LP.Brand.Open">
                  <Label resid="Button.Label"/>
                  <Supertip>
                    <Title resid="Button.Label"/>
                    <Description resid="Button.Tip"/>
                  </Supertip>
              ${icons}
                  <Action xsi:type="ShowTaskpane">
                    <TaskpaneId>LPBrandPanel</TaskpaneId>
                    <SourceLocation resid="Taskpane.Url"/>
                  </Action>
                </Control>
              </Group>
            </OfficeTab>
          </ExtensionPoint>`;

  if (kind === 'documents') {
    const host = (h: string) => `      <Host xsi:type="${h}">
        <DesktopFormFactor>
          <FunctionFile resid="Taskpane.Url"/>
          ${button('TabHome')}
        </DesktopFormFactor>
      </Host>`;
    return `<?xml version="1.0" encoding="UTF-8"?>
<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bt="http://schemas.microsoft.com/office/officeappbasictypes/1.0" xmlns:ov="http://schemas.microsoft.com/office/taskpaneappversionoverrides" xsi:type="TaskPaneApp">
${top}
  <Hosts>
    <Host Name="Document"/>
    <Host Name="Workbook"/>
    <Host Name="Presentation"/>
  </Hosts>
  <DefaultSettings>
    <SourceLocation DefaultValue="${pane}"/>
  </DefaultSettings>
  <Permissions>ReadWriteDocument</Permissions>
  <VersionOverrides xmlns="http://schemas.microsoft.com/office/taskpaneappversionoverrides" xsi:type="VersionOverridesV1_0">
    <Hosts>
${['Document', 'Workbook', 'Presentation'].map(host).join('\n')}
    </Hosts>
${resources}
  </VersionOverrides>
</OfficeApp>
`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bt="http://schemas.microsoft.com/office/officeappbasictypes/1.0" xmlns:mailappor="http://schemas.microsoft.com/office/mailappversionoverrides/1.0" xsi:type="MailApp">
${top}
  <Hosts>
    <Host Name="Mailbox"/>
  </Hosts>
  <Requirements>
    <Sets>
      <Set Name="Mailbox" MinVersion="1.8"/>
    </Sets>
  </Requirements>
  <FormSettings>
    <Form xsi:type="ItemEdit">
      <DesktopSettings>
        <SourceLocation DefaultValue="${pane}"/>
      </DesktopSettings>
    </Form>
  </FormSettings>
  <Permissions>ReadWriteItem</Permissions>
  <Rule xsi:type="RuleCollection" Mode="Or">
    <Rule xsi:type="ItemIs" ItemType="Message" FormType="Edit"/>
  </Rule>
  <DisableEntityHighlighting>false</DisableEntityHighlighting>
  <VersionOverrides xmlns="http://schemas.microsoft.com/office/mailappversionoverrides" xsi:type="VersionOverridesV1_0">
    <Requirements>
      <bt:Sets DefaultMinVersion="1.8">
        <bt:Set Name="Mailbox"/>
      </bt:Sets>
    </Requirements>
    <Hosts>
      <Host xsi:type="MailHost">
        <DesktopFormFactor>
          <FunctionFile resid="Taskpane.Url"/>
          ${button('TabDefault')}
        </DesktopFormFactor>
      </Host>
    </Hosts>
${resources}
  </VersionOverrides>
</OfficeApp>
`;
}
