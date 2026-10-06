using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Doorlist.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class RetireReleaseTrackerContract : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Hand-written: EF sees no model change, because the switch step
            // (RetireReleaseTrackerSwitch) already stopped mapping these tables.
            // No running API version uses them any more, so they can go.
            // Children first, for the foreign keys.
            migrationBuilder.DropTable(name: "ChecklistItems");
            migrationBuilder.DropTable(name: "Releases");
            migrationBuilder.DropTable(name: "Environments");
            migrationBuilder.DropTable(name: "Apps");

            // The release tracker's roles, and the demo users seeded for them.
            // A demo user is kept if it has since been given a Doorlist role or
            // holds tickets. Deleting a role or user cascades to its links.
            migrationBuilder.Sql("""
                DELETE u FROM [AspNetUsers] AS u
                WHERE u.[Email] IN (N'lead@example.com', N'developer@example.com', N'viewer@example.com')
                  AND NOT EXISTS (SELECT 1 FROM [Tickets] AS t WHERE t.[HolderId] = u.[Id])
                  AND NOT EXISTS (
                      SELECT 1 FROM [AspNetUserRoles] AS ur
                      JOIN [AspNetRoles] AS r ON r.[Id] = ur.[RoleId]
                      WHERE ur.[UserId] = u.[Id] AND r.[Name] NOT IN (N'Lead', N'Developer', N'Viewer'));

                DELETE FROM [AspNetRoles] WHERE [Name] IN (N'Lead', N'Developer', N'Viewer');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Hand-written: recreate the tables, empty, exactly as the switch
            // step left them (this is EF's own CreateTable code for them), so
            // RetireReleaseTrackerSwitch and older migrations can roll back
            // from here. Their rows, and the deleted roles and demo users,
            // aren't restored: restore a backup for that.
            migrationBuilder.CreateTable(
                name: "Apps",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Apps", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Environments",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    AppId = table.Column<int>(type: "int", nullable: false),
                    ApiUrl = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    IsProduction = table.Column<bool>(type: "bit", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Environments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Environments_Apps_AppId",
                        column: x => x.AppId,
                        principalTable: "Apps",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Releases",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    AppId = table.Column<int>(type: "int", nullable: false),
                    EnvironmentId = table.Column<int>(type: "int", nullable: false),
                    BuildNumber = table.Column<int>(type: "int", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    Platform = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    ShippedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ShippedBy = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    VersionName = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Releases", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Releases_Apps_AppId",
                        column: x => x.AppId,
                        principalTable: "Apps",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Releases_Environments_EnvironmentId",
                        column: x => x.EnvironmentId,
                        principalTable: "Environments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ChecklistItems",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ReleaseId = table.Column<int>(type: "int", nullable: false),
                    DoneAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DoneBy = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    IsDone = table.Column<bool>(type: "bit", nullable: false),
                    Position = table.Column<int>(type: "int", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChecklistItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ChecklistItems_Releases_ReleaseId",
                        column: x => x.ReleaseId,
                        principalTable: "Releases",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Apps_Name",
                table: "Apps",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ChecklistItems_ReleaseId_Position",
                table: "ChecklistItems",
                columns: new[] { "ReleaseId", "Position" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Environments_AppId_Name",
                table: "Environments",
                columns: new[] { "AppId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Releases_AppId_EnvironmentId_Platform_VersionName_BuildNumber",
                table: "Releases",
                columns: new[] { "AppId", "EnvironmentId", "Platform", "VersionName", "BuildNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Releases_EnvironmentId",
                table: "Releases",
                column: "EnvironmentId");
        }
    }
}
