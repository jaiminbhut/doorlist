using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shiplog.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class SplitReleaseVersionExpand : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "BuildNumber",
                table: "Releases",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VersionName",
                table: "Releases",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            // Hand-written: split every existing Version into VersionName and
            // BuildNumber. "2.4.0 (118)" becomes ("2.4.0", 118); anything that
            // doesn't end in a parenthesised whole number stays a name with no
            // build. Must agree with ReleaseVersion.Parse. Self-contained on
            // purpose: a migration must not change if application code does.
            migrationBuilder.Sql(BackfillSql);
        }

        internal const string BackfillSql = """
            UPDATE r
            SET VersionName = CASE WHEN p.IsSplit = 1 THEN p.Name ELSE r.[Version] END,
                BuildNumber = CASE WHEN p.IsSplit = 1 THEN p.Build END
            FROM [Releases] AS r
            CROSS APPLY (
                SELECT OpenAt = CASE
                    WHEN RIGHT(r.[Version], 1) = N')' AND CHARINDEX(N'(', r.[Version]) > 0
                        THEN LEN(r.[Version]) - CHARINDEX(N'(', REVERSE(r.[Version])) + 1
                    ELSE 0 END
            ) AS o
            CROSS APPLY (
                SELECT Name = CASE WHEN o.OpenAt > 1 THEN RTRIM(LEFT(r.[Version], o.OpenAt - 1)) END,
                       Digits = CASE WHEN o.OpenAt > 1 THEN SUBSTRING(r.[Version], o.OpenAt + 1, LEN(r.[Version]) - o.OpenAt - 1) END
            ) AS d
            CROSS APPLY (
                SELECT Name = d.Name,
                       Build = TRY_CAST(d.Digits AS int),
                       IsSplit = CASE
                           WHEN LEN(d.Name) > 0 AND d.Digits NOT LIKE N'%[^0-9]%' AND LEN(d.Digits) > 0
                                AND TRY_CAST(d.Digits AS int) IS NOT NULL THEN 1
                           ELSE 0 END
            ) AS p
            WHERE r.VersionName IS NULL;
            """;

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BuildNumber",
                table: "Releases");

            migrationBuilder.DropColumn(
                name: "VersionName",
                table: "Releases");
        }
    }
}
