import { memo } from 'react';
import { CellSelection } from '@ghostcast/shared';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface CellPresenceIndicatorProps {
  /** Users who have selected this cell */
  selections: CellSelection[];
  /** Zoom level for scaling (default: 1) */
  zoomLevel?: number;
}

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

/**
 * Shows a small avatar bubble indicating which users have selected a cell.
 * Displays the primary user's avatar with a "+N" badge if multiple users are selecting.
 */
export const CellPresenceIndicator = memo(function CellPresenceIndicator({
  selections,
  zoomLevel = 1,
}: CellPresenceIndicatorProps) {
  if (selections.length === 0) return null;

  const primary = selections[0];
  const additionalCount = selections.length - 1;

  const tooltipContent =
    selections.length === 1
      ? `${primary.user.firstName} ${primary.user.lastName}`
      : `${primary.user.firstName} ${primary.user.lastName} +${additionalCount}`;

  // Scale sizes based on zoom level
  const avatarSize = Math.round(20 * zoomLevel);
  const badgeSize = Math.round(16 * zoomLevel);
  const fontSize = Math.round(8 * zoomLevel);
  const borderWidth = Math.max(1, Math.round(2 * zoomLevel));
  const offset = Math.round(2 * zoomLevel);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="absolute z-10 flex items-center pointer-events-auto"
            style={{ top: offset, right: offset }}
          >
            {/* Primary user avatar */}
            <Avatar
              className="shadow-sm"
              style={{
                borderColor: primary.user.color,
                borderWidth: borderWidth,
                borderStyle: 'solid',
                width: avatarSize,
                height: avatarSize,
              }}
            >
              {primary.user.avatar ? (
                <AvatarImage src={primary.user.avatar} alt={`${primary.user.firstName} ${primary.user.lastName}`} />
              ) : (
                <AvatarFallback
                  className="font-medium text-white"
                  style={{ backgroundColor: primary.user.color, fontSize }}
                >
                  {getInitials(primary.user.firstName, primary.user.lastName)}
                </AvatarFallback>
              )}
            </Avatar>

            {/* Additional users indicator */}
            {additionalCount > 0 && (
              <span
                className="flex items-center justify-center rounded-full font-bold text-white border border-white shadow-sm"
                style={{
                  backgroundColor: selections[1]?.user.color ?? '#6B7280',
                  width: badgeSize,
                  height: badgeSize,
                  fontSize,
                  marginLeft: -Math.round(4 * zoomLevel),
                }}
              >
                +{additionalCount}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
